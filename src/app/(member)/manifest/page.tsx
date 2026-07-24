import type { Metadata } from "next";
import { Card, StateBlock } from "@/components/ds";
import { EVENT_CLASS_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { TIER_RANK, getMember, type Rsvp, type Voyage, type VoyageCapacity } from "../data";
import { RsvpControls } from "./rsvp-controls";

export const metadata: Metadata = { title: "Voyages" };

export default async function VoyagesPage() {
  const { supabase, user, profile } = await getMember();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const [voyagesRes, capacityRes, rsvpsRes, addonsRes, planRes, usageRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .gte("starts_at", nowIso)
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("rsvps").select("*").eq("profile_id", user.id),
    supabase.from("addons").select("*").eq("active", true).order("name", { ascending: true }),
    profile?.plan_id
      ? supabase.from("membership_plans").select("*").eq("id", profile.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("member_pass_usage").select("*").eq("profile_id", user.id),
  ]);

  const voyages: Voyage[] = voyagesRes.data ?? [];
  const addons = (addonsRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price_cents: a.price_cents,
  }));
  const capacity = new Map<string, VoyageCapacity>(
    (capacityRes.data ?? [])
      .filter((c): c is VoyageCapacity & { voyage_id: string } => !!c.voyage_id)
      .map((c) => [c.voyage_id, c])
  );
  const mine = new Map<string, Rsvp>(
    (rsvpsRes.data ?? []).map((r) => [r.voyage_id, r])
  );

  /* Add-ons already riding on my aboard passes, for the upsell dialog. */
  const aboardRsvpIds = (rsvpsRes.data ?? [])
    .filter((r) => r.status === "aboard")
    .map((r) => r.id);
  const attachedRows =
    aboardRsvpIds.length > 0
      ? (await supabase.from("rsvp_addons").select("rsvp_id, addon_id").in("rsvp_id", aboardRsvpIds))
          .data ?? []
      : [];
  const attachedByRsvp = new Map<string, string[]>();
  for (const row of attachedRows) {
    attachedByRsvp.set(row.rsvp_id, [...(attachedByRsvp.get(row.rsvp_id) ?? []), row.addon_id]);
  }

  /* Pass meter — this calendar month's usage against the plan allowance. */
  const plan = planRes.data;
  const passesUsed =
    (usageRes.data ?? []).find((u) => {
      if (!u.month) return false;
      const m = new Date(u.month);
      return m.getUTCFullYear() === now.getUTCFullYear() && m.getUTCMonth() === now.getUTCMonth();
    })?.passes_used ?? 0;
  const monthName = now.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const passMeter = plan
    ? plan.events_per_month > 0
      ? `${passesUsed} OF ${plan.events_per_month} PASSES USED · ${monthName}`
      : "PASSES À LA CARTE"
    : null;
  const earlyDays = plan?.early_days ?? 0;

  const myRank = TIER_RANK[profile?.tier ?? "regional"] ?? 0;

  /* The single recommended pass: soonest open, unclaimed, within tier and window. */
  const recommendedId =
    voyages.find((v) => {
      const cap = capacity.get(v.id);
      const left = cap?.berths_left ?? v.berths_total;
      const r = mine.get(v.id);
      return (
        v.status === "scheduled" &&
        (TIER_RANK[v.min_tier] ?? 0) <= myRank &&
        left > 0 &&
        nowMs >= new Date(v.starts_at).getTime() - earlyDays * 86400000 &&
        (!r || r.status === "not_going")
      );
    })?.id ?? null;

  return (
    <div>
      <span className="mbr-eyebrow">The manifest</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Voyages.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 8, maxWidth: "52ch" }}>
        Passes are few by design. Claim one, bring up to two guests, or hold the
        waitlist — releases go out in order.
      </p>
      {passMeter ? (
        <div className="mbr-mono" style={{ marginTop: 10 }}>
          {passMeter}
        </div>
      ) : null}

      {voyages.length === 0 ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="Nothing on the water."
            detail="The next season's manifest is being drawn. Watch the Word."
          />
        </div>
      ) : (
        <div className="voy-list">
          {voyages.map((v, i) => {
            const cap = capacity.get(v.id);
            const left = cap?.berths_left ?? v.berths_total;
            const aboard = cap?.aboard ?? 0;
            const r = mine.get(v.id) ?? null;
            const locked = (TIER_RANK[v.min_tier] ?? 0) > myRank;
            /* Booking window: opens early_days ahead of departure, per plan. */
            const start = new Date(v.starts_at);
            const opensMs = start.getTime() - earlyDays * 86400000;
            const windowNote =
              nowMs < opensMs
                ? `THE WINDOW OPENS ${logDate(new Date(opensMs).toISOString())} FOR YOUR TIER`
                : null;
            /* Add-on upsell stays open until 18:00 the night before. */
            const addonCutoff = new Date(
              start.getFullYear(),
              start.getMonth(),
              start.getDate() - 1,
              18,
              0,
              0,
              0
            );
            /* Display only — knots land by trigger on completion (legacy fathoms_* plumbing). */
            const baseFm =
              v.kind === "port_day" ? 40 : v.distance_nm != null ? v.distance_nm * 10 : null;
            const knotsOnCompletion =
              baseFm != null ? Math.round(baseFm * (v.fathoms_multiplier ?? 1)) : null;
            const meta = [
              logDate(v.starts_at),
              logTime(v.starts_at),
              EVENT_CLASS_LABEL[v.class].toUpperCase(),
              ...(v.distance_nm != null ? [`${v.distance_nm} NM`] : []),
              price(v.price_cents),
              v.status === "weather_hold"
                ? "WEATHER HOLD"
                : `${aboard} ABOARD · ${Math.max(0, left)} PASSES LEFT`,
            ];
            return (
              <div key={v.id} className={i === 0 ? "ls-rise" : i < 4 ? `ls-rise-${Math.min(i, 3)}` : undefined}>
                <Card
                  media={v.media}
                  eyebrow={`${v.kind === "port_day" ? "Ashore" : "At sea"} · ${logDate(v.starts_at)}`}
                  title={v.title}
                  meta={meta}
                  footer={
                    <RsvpControls
                      voyageId={v.id}
                      voyageTitle={v.title}
                      myStatus={r?.status ?? null}
                      guests={r?.guests ?? 0}
                      guestNames={r?.guest_names ?? []}
                      passesLeft={left}
                      weatherHold={v.status === "weather_hold"}
                      locked={locked}
                      lockedNote={`${TIER_LABEL[v.min_tier]} passes open at ${TIER_LABEL[v.min_tier]} tier.`}
                      windowNote={windowNote}
                      recommended={v.id === recommendedId}
                      priceCents={v.price_cents}
                      depositRequired={v.deposit_required}
                      addons={addons}
                      attachedAddonIds={r ? attachedByRsvp.get(r.id) ?? [] : []}
                      addonWindowOpen={nowMs < addonCutoff.getTime()}
                      knotsOnCompletion={knotsOnCompletion}
                      fullCredit={start.getTime() - nowMs > 48 * 3600 * 1000}
                      boardingCode={r?.status === "aboard" ? r.boarding_code : null}
                    />
                  }
                >
                  {v.blurb}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
