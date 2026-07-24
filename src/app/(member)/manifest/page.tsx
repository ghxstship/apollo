import type { Metadata } from "next";
import { Card, StateBlock } from "@/components/ds";
import { EVENT_CLASS_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { TIER_RANK, getMember, type Rsvp, type Voyage, type VoyageCapacity } from "../data";
import { RsvpControls } from "./rsvp-controls";

export const metadata: Metadata = { title: "Voyages" };

export default async function VoyagesPage() {
  const { supabase, user, profile } = await getMember();
  const nowIso = new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();

  const [voyagesRes, capacityRes, rsvpsRes, addonsRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .gte("starts_at", nowIso)
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("rsvps").select("*").eq("profile_id", user.id),
    supabase.from("addons").select("*").eq("active", true).order("name", { ascending: true }),
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

  const myRank = TIER_RANK[profile?.tier ?? "regional"] ?? 0;

  /* The single recommended berth: soonest open, unclaimed, within tier. */
  const recommendedId =
    voyages.find((v) => {
      const cap = capacity.get(v.id);
      const left = cap?.berths_left ?? v.berths_total;
      const r = mine.get(v.id);
      return (
        v.status === "scheduled" &&
        (TIER_RANK[v.min_tier] ?? 0) <= myRank &&
        left > 0 &&
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
        Berths are few by design. Claim one, bring up to four guests, or hold the
        waitlist — releases go out in order.
      </p>

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
            /* Display only — fathoms land by trigger on completion. */
            const baseFm =
              v.kind === "salon" ? 40 : v.distance_nm != null ? v.distance_nm * 10 : null;
            const fathomsOnCompletion =
              baseFm != null ? Math.round(baseFm * (v.fathoms_multiplier ?? 1)) : null;
            const meta = [
              logDate(v.starts_at),
              logTime(v.starts_at),
              EVENT_CLASS_LABEL[v.class].toUpperCase(),
              ...(v.distance_nm != null ? [`${v.distance_nm} NM`] : []),
              price(v.price_cents),
              v.status === "weather_hold"
                ? "WEATHER HOLD"
                : `${aboard} ABOARD · ${Math.max(0, left)} BERTHS LEFT`,
            ];
            return (
              <div key={v.id} className={i === 0 ? "ls-rise" : i < 4 ? `ls-rise-${Math.min(i, 3)}` : undefined}>
                <Card
                  media={v.media}
                  eyebrow={`${v.kind === "salon" ? "Ashore" : "At sea"} · ${logDate(v.starts_at)}`}
                  title={v.title}
                  meta={meta}
                  footer={
                    <RsvpControls
                      voyageId={v.id}
                      voyageTitle={v.title}
                      myStatus={r?.status ?? null}
                      guests={r?.guests ?? 0}
                      berthsLeft={left}
                      weatherHold={v.status === "weather_hold"}
                      locked={locked}
                      lockedNote={`${TIER_LABEL[v.min_tier]} berths open at ${TIER_LABEL[v.min_tier]} tier.`}
                      recommended={v.id === recommendedId}
                      priceCents={v.price_cents}
                      depositRequired={v.deposit_required}
                      addons={v.price_cents > 0 || v.deposit_required ? addons : []}
                      fathomsOnCompletion={fathomsOnCompletion}
                      fullCredit={new Date(v.starts_at).getTime() - nowMs > 48 * 3600 * 1000}
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
