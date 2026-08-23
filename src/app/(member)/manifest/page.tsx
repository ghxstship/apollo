import type { Metadata } from "next";
import { Card, StateBlock } from "@/components/ds";
import { EVENT_CLASS_LABEL, TIER_LABEL, logDate, logTime, price } from "@/lib/format";
import { TIER_RANK, getMember, type Rsvp, type Voyage, type VoyageCapacity } from "../data";
import { RsvpControls } from "./rsvp-controls";
import type { CrewSeeker, GuestStub, MemberOption, StandingOffer } from "./pass-extras";
import { TransferInbox, type IncomingOffer } from "./transfer-inbox";

export const metadata: Metadata = { title: "Voyages" };

export default async function VoyagesPage() {
  const { supabase, user, profile, onHold } = await getMember();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const [
    voyagesRes,
    capacityRes,
    rsvpsRes,
    addonsRes,
    planRes,
    usageRes,
    positionRes,
    transferRes,
    crewRes,
    rollRes,
  ] = await Promise.all([
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
    /* Where you stand on every list you're holding. */
    supabase.from("waitlist_position").select("*").eq("profile_id", user.id),
    /* Hand-offs in both directions, still standing. */
    supabase.from("pass_transfers").select("*").eq("status", "offered"),
    /* Everyone forming crew on the sailings ahead. */
    supabase.from("crew_requests").select("*").eq("open", true),
    /* The roll a pass may be handed to. */
    supabase
      .from("member_directory")
      .select("id, full_name, member_no, handle")
      .eq("status", "active")
      .neq("id", user.id)
      .order("full_name", { ascending: true }),
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
  const [attachedRes, guestRes] =
    aboardRsvpIds.length > 0
      ? await Promise.all([
          supabase.from("rsvp_addons").select("rsvp_id, addon_id").in("rsvp_id", aboardRsvpIds),
          supabase.from("rsvp_guests").select("*").in("rsvp_id", aboardRsvpIds),
        ])
      : [{ data: [] }, { data: [] }];
  const attachedRows = attachedRes.data ?? [];
  const attachedByRsvp = new Map<string, string[]>();
  for (const row of attachedRows) {
    attachedByRsvp.set(row.rsvp_id, [...(attachedByRsvp.get(row.rsvp_id) ?? []), row.addon_id]);
  }

  /* Per-guest stubs — the manifest cuts these from guest_names by trigger.
     Whether each guest has signed comes from the signature record; the member
     can see the standing of their own guests, and pass on the link. */
  const guestIds = (guestRes.data ?? []).map((g) => g.id);
  const { data: guestSigs } = guestIds.length
    ? await supabase.from("signatures").select("guest_id").in("guest_id", guestIds)
    : { data: [] };
  const signedGuests = new Set((guestSigs ?? []).map((s) => s.guest_id));

  /* Cabin plans for my assigned hulls, with live remaining-berth counts. */
  const myVesselIds = [...new Set(
    (rsvpsRes.data ?? []).filter((r) => r.status === "aboard" && r.vessel_id).map((r) => r.vessel_id as string)
  )];
  const { data: cabinRows } = myVesselIds.length
    ? await supabase.from("cabins").select("*").in("vessel_id", myVesselIds).eq("active", true).order("position")
    : { data: [] };
  const cabinIds = (cabinRows ?? []).map((c) => c.id);
  const { data: cabinClaims } = cabinIds.length
    ? await supabase.from("rsvps").select("cabin_id, voyage_id").in("cabin_id", cabinIds).eq("status", "aboard")
    : { data: [] };

  const guestsByRsvp = new Map<string, GuestStub[]>();
  for (const g of guestRes.data ?? []) {
    guestsByRsvp.set(g.rsvp_id, [
      ...(guestsByRsvp.get(g.rsvp_id) ?? []),
      {
        name: g.name,
        code: g.boarding_code,
        signToken: g.sign_token,
        signed: signedGuests.has(g.id),
      },
    ]);
  }

  /* Waitlist order, one line per list you're holding. */
  const positionByVoyage = new Map<string, number>();
  for (const p of positionRes.data ?? []) {
    if (p.voyage_id && p.position != null) positionByVoyage.set(p.voyage_id, p.position);
  }

  /* The roll, for a hand-off and for putting names to crew requests. */
  const roll = rollRes.data ?? [];
  const nameOf = new Map<string, string>(
    roll.map((p) => [p.id, p.full_name ?? "A member"] as const)
  );
  const handleOf = new Map<string, string | null>(roll.map((p) => [p.id, p.handle] as const));
  const members: MemberOption[] = roll.map((p) => ({
    id: p.id,
    label: `${p.full_name ?? "A member"} · ${p.member_no ?? "SYR-0000"}`,
  }));

  /* Hand-offs: what you've offered, and what's been offered to you. */
  const transfers = transferRes.data ?? [];
  const offeredByRsvp = new Map<string, StandingOffer>();
  for (const t of transfers) {
    if (t.from_profile === user.id) {
      offeredByRsvp.set(t.rsvp_id, { id: t.id, name: nameOf.get(t.to_profile) ?? "A member" });
    }
  }
  const inboundRows = transfers.filter((t) => t.to_profile === user.id);
  let inbound: IncomingOffer[] = [];
  if (inboundRows.length > 0) {
    const { data: theirRsvps } = await supabase
      .from("rsvps")
      .select("id, voyage_id")
      .in("id", inboundRows.map((t) => t.rsvp_id));
    const voyageOfRsvp = new Map((theirRsvps ?? []).map((r) => [r.id, r.voyage_id] as const));
    const wantedVoyages = Array.from(new Set((theirRsvps ?? []).map((r) => r.voyage_id)));
    const { data: theirVoyages } = wantedVoyages.length
      ? await supabase.from("voyages").select("id, title, starts_at").in("id", wantedVoyages)
      : { data: [] as Array<{ id: string; title: string; starts_at: string }> };
    const voyageById = new Map((theirVoyages ?? []).map((v) => [v.id, v] as const));
    inbound = inboundRows.flatMap((t) => {
      const voyage = voyageById.get(voyageOfRsvp.get(t.rsvp_id) ?? "");
      if (!voyage) return [];
      return [
        {
          id: t.id,
          fromName: nameOf.get(t.from_profile) ?? "A member",
          voyageTitle: voyage.title,
          meta: `${logDate(voyage.starts_at)} · ${logTime(voyage.starts_at)}`,
        },
      ];
    });
  }

  /* Crew forming — yours on one side, everyone else's on the other. */
  const crewMineByVoyage = new Map<string, CrewSeeker>();
  const crewOthersByVoyage = new Map<string, CrewSeeker[]>();
  for (const c of crewRes.data ?? []) {
    const seeker: CrewSeeker = {
      id: c.id,
      name: c.profile_id === user.id ? "You" : nameOf.get(c.profile_id) ?? "A member",
      handle: c.profile_id === user.id ? null : handleOf.get(c.profile_id) ?? null,
      note: c.note,
    };
    if (c.profile_id === user.id) crewMineByVoyage.set(c.voyage_id, seeker);
    else crewOthersByVoyage.set(c.voyage_id, [...(crewOthersByVoyage.get(c.voyage_id) ?? []), seeker]);
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

  /* The class ceiling is the second gate, and it used to be invisible: an
     odyssey sailing looked claimable to everyone and the guard refused it at
     submit ("this sailing runs past your class tier"). A pass you cannot claim
     should read as locked, not as an invitation. */
  const CLASS_RANK: Record<string, number> = {
    excursion: 0, voyage: 0, overland: 1, expedition: 1, trek: 2, odyssey: 2,
  };
  const myCeiling = CLASS_RANK[plan?.class_ceiling ?? "voyage"] ?? 0;
  const pastMyClass = (v: { sub_class: string | null }) =>
    v.sub_class ? (CLASS_RANK[v.sub_class] ?? 0) > myCeiling : false;

  const myRank = TIER_RANK[profile?.tier ?? "regional"] ?? 0;

  /* Split draws are written shoreside — offered only when the club can. */
  const splitOffered = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  /* The single recommended pass: soonest open, unclaimed, within tier and window. */
  const recommendedId =
    voyages.find((v) => {
      const cap = capacity.get(v.id);
      const left = cap?.berths_left ?? v.berths_total;
      const r = mine.get(v.id);
      return (
        v.status === "scheduled" &&
        (TIER_RANK[v.min_tier] ?? 0) <= myRank &&
        !pastMyClass(v) &&
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
        Passes are few by design. Claim one{profile?.tier === "global" ? ", bring up to two guests," : ""} or hold the
        waitlist — releases go out in order.
      </p>
      {passMeter ? (
        <div className="mbr-mono" style={{ marginTop: 10 }}>
          {passMeter}
        </div>
      ) : null}

      <TransferInbox offers={inbound} />

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
            const overClass = pastMyClass(v);
            const locked = (TIER_RANK[v.min_tier] ?? 0) > myRank || overClass || onHold;
            /* Booking window: opens early_days ahead of departure, per plan. */
            const start = new Date(v.starts_at);
            const opensMs = start.getTime() - earlyDays * 86400000;
            const windowNote =
              nowMs < opensMs
                ? `THE WINDOW OPENS ${logDate(new Date(opensMs).toISOString())} ON YOUR PLAN`
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
                      guestsAllowed={profile?.tier === "global"}
                      locked={locked}
                      lockedNote={
                        onHold
                          ? "Your membership is on hold. Resume it on your page to claim a pass."
                          : overClass
                            ? `This sailing runs past your class. ${v.sub_class ? v.sub_class.charAt(0).toUpperCase() + v.sub_class.slice(1) : "It"} passes open on a deeper plan.`
                            : `${TIER_LABEL[v.min_tier]} passes open at ${TIER_LABEL[v.min_tier]} tier.`
                      }
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
                      rsvpId={r?.id ?? null}
                      waitlistPosition={positionByVoyage.get(v.id) ?? null}
                      autoClaim={r?.auto_claim ?? false}
                      members={members}
                      standingOffer={r ? offeredByRsvp.get(r.id) ?? null : null}
                      guestStubs={r ? guestsByRsvp.get(r.id) ?? [] : []}
                      crewMine={crewMineByVoyage.get(v.id) ?? null}
                      crewSeekers={crewOthersByVoyage.get(v.id) ?? []}
                      splitOffered={splitOffered}
                      cabins={
                        r?.status === "aboard" && r.vessel_id
                          ? (cabinRows ?? [])
                              .filter((c) => c.vessel_id === r.vessel_id)
                              .map((c) => ({
                                id: c.id,
                                name: c.name,
                                premiumCents: c.premium_cents,
                                left:
                                  c.berths -
                                  (cabinClaims ?? []).filter(
                                    (cl) => cl.cabin_id === c.id && cl.voyage_id === v.id
                                  ).length,
                              }))
                          : []
                      }
                      cabinId={r?.cabin_id ?? null}
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
