import type { Metadata } from "next";
import { Card, StateBlock } from "@/components/ds";
import { PLACE } from "@/lib/brand";
import {
  SETTING_LABEL,
  TIER_LABEL,
  eveningBefore,
  logDate,
  logDateTime,
  logTime,
  price,
} from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { durationChip } from "@/components/site/episode-chips";
import { TIER_RANK, getMember, type Pass, type Episode, type EpisodeCapacity } from "../data";
import { PassControls, type DaybedOffer } from "./pass-controls";
import type { CrewSeeker, GuestStub, MemberOption, StandingOffer } from "./pass-extras";
import { TransferInbox, type IncomingOffer } from "./transfer-inbox";

export const metadata: Metadata = { title: "Passes" };

export default async function PassesPage() {
  const { supabase, user, profile, onHold } = await getMember();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const [
    episodesRes,
    capacityRes,
    passesRes,
    addonsRes,
    planRes,
    usageRes,
    positionRes,
    transferRes,
    crewRes,
    rollRes,
    daybedProductRes,
    segmentCapRes,
    seriesRes,
    creditHoursRes,
    citiesRes,
    creditRes,
  ] = await Promise.all([
    supabase
      .from("episodes")
      .select("*")
      .gte("starts_at", nowIso)
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
    supabase.from("episode_capacity").select("*"),
    supabase.from("passes").select("*").eq("profile_id", user.id),
    supabase.from("addons").select("*").eq("active", true).order("name", { ascending: true }),
    profile?.plan_id
      ? supabase.from("membership_plans").select("*").eq("id", profile.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("member_pass_usage").select("*").eq("profile_id", user.id),
    /* Where you stand on every list you're holding. */
    supabase.from("waitlist_position").select("*").eq("profile_id", user.id),
    /* Hand-offs in both directions, still standing. */
    supabase.from("pass_transfers").select("*").eq("status", "offered"),
    /* Everyone forming crew on the episodes ahead. */
    supabase.from("crew_requests").select("*").eq("open", true),
    /* The roll a pass may be handed to: members who chose to be findable.
       This filtered on `status = active`, which stopped meaning "active" the
       moment the directory opt-out began masking standing — say what is
       actually meant instead of relying on a column that is now withheld. */
    supabase
      .from("member_directory")
      .select("id, full_name, member_no, handle")
      .eq("in_directory", true)
      .neq("id", user.id)
      .order("full_name", { ascending: true }),
    /* The bow daybed is a product with a price, a cap and a party size on its
       own row — the card reads them rather than restating them. Another
       module's table, reached through the moduleTables seam. */
    moduleTables(supabase)
      .from("club_products")
      .select("price_cents, per_sailing_cap, party_size, published")
      .eq("slug", "vip_daybed")
      .maybeSingle(),
    /* An episode with segment caps is a composition episode: its door is the
       vetting page, and an rsvp written here without a segment would be
       refused — or worse, seated outside the ratio. */
    moduleTables(supabase).from("episode_segment_caps").select("episode_id"),
    /* Category decides whether the daybed is even a thing on this water;
       access decides whether a pass is on sale at all; the label is what the
       card actually reads. Read once and mapped by slug below — never per
       row. */
    moduleTables(supabase).from("series").select("slug, label, category, access"),
    /* The release window is the club's own figure, read rather than retyped. */
    supabase.rpc("club_setting", { p_key: "release_credit_hours" }),
    /* Names for the city lock's refusal — read once, not per row. */
    supabase.from("cities").select("id,name"),
    /* This month's unspent plan credit. Drawn down in SQL since the 3rd
       and never shown to the member who was spending it. */
    supabase.rpc("pass_credit_left", {}),
  ]);

  const episodes: Episode[] = episodesRes.data ?? [];

  const daybedRow = daybedProductRes.data as
    | { price_cents: number | null; per_sailing_cap: number | null; party_size: number | null; published: boolean }
    | null;
  const daybedOffer: DaybedOffer | null =
    daybedRow && daybedRow.published && daybedRow.price_cents != null
      ? {
          priceCents: daybedRow.price_cents,
          cap: daybedRow.per_sailing_cap ?? 2,
          party: daybedRow.party_size ?? 4,
        }
      : null;
  const compositionIds = new Set(
    ((segmentCapRes.data ?? []) as Array<{ episode_id: string }>).map((r) => r.episode_id)
  );
  const seriesBySlug = new Map(
    (
      (seriesRes.data ?? []) as Array<{
        slug: string;
        label: string;
        category: string;
        access: string;
      }>
    ).map((f) => [f.slug, f] as const)
  );
  const creditHours =
    typeof creditHoursRes.data === "number" && creditHoursRes.data > 0 ? creditHoursRes.data : 48;
  const creditWindowMs = creditHours * 3600 * 1000;
  const addons = (addonsRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    price_cents: a.price_cents,
  }));
  const capacity = new Map<string, EpisodeCapacity>(
    (capacityRes.data ?? [])
      .filter((c): c is EpisodeCapacity & { episode_id: string } => !!c.episode_id)
      .map((c) => [c.episode_id, c])
  );
  const mine = new Map<string, Pass>(
    (passesRes.data ?? []).map((r) => [r.episode_id, r])
  );

  /* Add-ons already riding on my aboard passes, for the upsell dialog. */
  const aboardPassIds = (passesRes.data ?? [])
    .filter((r) => r.status === "aboard")
    .map((r) => r.id);
  const [attachedRes, guestRes, daybedRes] =
    aboardPassIds.length > 0
      ? await Promise.all([
          supabase.from("pass_addons").select("rsvp_id, addon_id").in("rsvp_id", aboardPassIds),
          supabase.from("pass_guests").select("*").in("rsvp_id", aboardPassIds),
          /* Bow daybeds already riding on my passes — the claim block flips
             to "held" instead of offering the button twice. */
          supabase.from("episode_daybeds").select("rsvp_id").in("rsvp_id", aboardPassIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const daybedPasses = new Set((daybedRes.data ?? []).map((d) => d.rsvp_id));
  const attachedRows = attachedRes.data ?? [];
  const attachedByPass = new Map<string, string[]>();
  for (const row of attachedRows) {
    attachedByPass.set(row.rsvp_id, [...(attachedByPass.get(row.rsvp_id) ?? []), row.addon_id]);
  }

  /* Per-guest stubs — the manifest cuts these from guest_names by trigger.
     Whether each guest has signed comes from the signature record; the member
     can see the standing of their own guests, and pass on the link. */
  const guestIds = (guestRes.data ?? []).map((g) => g.id);
  /* Against the CURRENTLY PUBLISHED waiver, not any signature ever. Counting
     every signature meant that after a waiver was republished the host saw
     "WAIVER SIGNED" beside a guest who had to sign again — and the copy-link
     block, which only shows for unsigned guests, was hidden from exactly the
     people who needed it. The gangway gate uses the published version, so this
     has to agree with it. */
  const { data: guestSigs } = guestIds.length
    ? await supabase
        .from("signatures")
        .select("guest_id, document_versions!inner(status, document_code)")
        .in("guest_id", guestIds)
        .eq("document_versions.status", "published")
        .is("redacted_at", null)
    : { data: [] };
  const signedGuests = new Set((guestSigs ?? []).map((s) => s.guest_id));

  /* Cabin plans for my assigned hulls, with live remaining-berth counts. */
  const myVesselIds = [...new Set(
    (passesRes.data ?? []).filter((r) => r.status === "aboard" && r.vessel_id).map((r) => r.vessel_id as string)
  )];
  const { data: cabinRows } = myVesselIds.length
    ? await supabase.from("cabins").select("*").in("vessel_id", myVesselIds).eq("active", true).order("position")
    : { data: [] };
  const cabinIds = (cabinRows ?? []).map((c) => c.id);
  /* Through a definer: passes is `profile_id = auth.uid()`, so reading other
     members' claims directly returned nothing and every cabin rendered free. */
  const { data: cabinClaims } = cabinIds.length
    ? await supabase.rpc("claimed_cabins", { p_cabins: cabinIds })
    : { data: [] as Array<{ cabin_id: string; episode_id: string }> };

  /* A couple pass's second head is one pass_guests row with kind 'partner'. It
     rides the same machinery — its own code, sign token and camera consent —
     but it is not a companion: it never counts against the guest allowance and
     the guest stepper must not read it as one. Separated here, once, so every
     control below sees companions as companions. */
  const guestsByPass = new Map<string, GuestStub[]>();
  const partnerByPass = new Map<string, GuestStub>();
  for (const g of guestRes.data ?? []) {
    const stub: GuestStub = {
      name: g.name,
      code: g.boarding_code,
      signToken: g.sign_token,
      signed: signedGuests.has(g.id),
    };
    if (g.kind === "partner") {
      partnerByPass.set(g.rsvp_id, stub);
      continue;
    }
    guestsByPass.set(g.rsvp_id, [...(guestsByPass.get(g.rsvp_id) ?? []), stub]);
  }

  /* Waitlist order, one line per list you're holding. */
  const positionByEpisode = new Map<string, number>();
  for (const p of positionRes.data ?? []) {
    if (p.episode_id && p.position != null) positionByEpisode.set(p.episode_id, p.position);
  }

  /* The roll, for a hand-off and for putting names to crew requests. */
  const roll = rollRes.data ?? [];

  /* Names for people this member is already dealing with, whether or not they
     chose to be listed. The roll is filtered to in_directory, so building the
     name map from it alone rendered "offered to A member" on the sender's own
     card — a pass hand-off is one of the grounds member_directory will name
     someone on, so the view would have answered. */
  const dealingWith = Array.from(
    new Set(
      [
        ...(transferRes.data ?? []).flatMap((t) => [t.from_profile, t.to_profile]),
        ...(crewRes.data ?? []).map((c) => c.profile_id),
      ].filter((id): id is string => !!id && id !== user.id)
    )
  ).filter((id) => !roll.some((p) => p.id === id));

  const extraRes = dealingWith.length
    ? await supabase.from("member_directory").select("id, full_name, handle").in("id", dealingWith)
    : { data: [] as Array<{ id: string; full_name: string | null; handle: string | null }> };

  const nameOf = new Map<string, string>(
    [...roll, ...(extraRes.data ?? [])].map((p) => [p.id, p.full_name ?? "A member"] as const)
  );
  const handleOf = new Map<string, string | null>(
    [...roll, ...(extraRes.data ?? [])].map((p) => [p.id, p.handle] as const)
  );
  const members: MemberOption[] = roll.map((p) => ({
    id: p.id,
    label: `${p.full_name ?? "A member"} · ${p.member_no ?? "UN-0000"}`,
  }));

  /* Hand-offs: what you've offered, and what's been offered to you. */
  const transfers = transferRes.data ?? [];
  const offeredByPass = new Map<string, StandingOffer>();
  for (const t of transfers) {
    if (t.from_profile === user.id) {
      offeredByPass.set(t.rsvp_id, { id: t.id, name: nameOf.get(t.to_profile) ?? "A member" });
    }
  }
  const inboundRows = transfers.filter((t) => t.to_profile === user.id);
  let inbound: IncomingOffer[] = [];
  if (inboundRows.length > 0) {
    /* Naming the episode behind an offer means reading the OFFERER's rsvp, and
       passes is `profile_id = auth.uid()`. The old code resolved it directly,
       always got zero rows, and returned [] — so an offer could be made and
       never seen, and acceptOffer/declineOffer were unreachable. */
    const { data: offers } = await supabase.rpc("incoming_transfers");
    inbound = (offers ?? []).map((o) => ({
      id: o.transfer_id,
      fromName: o.from_name,
      voyageTitle: o.title,
      meta: `${logDate(o.starts_at, o.time_zone)} · ${logTime(o.starts_at, o.time_zone)}`,
    }));
  }

  /* Crew forming — yours on one side, everyone else's on the other. */
  const crewMineByEpisode = new Map<string, CrewSeeker>();
  const crewOthersByEpisode = new Map<string, CrewSeeker[]>();
  for (const c of crewRes.data ?? []) {
    const seeker: CrewSeeker = {
      id: c.id,
      name: c.profile_id === user.id ? "You" : nameOf.get(c.profile_id) ?? "A member",
      handle: c.profile_id === user.id ? null : handleOf.get(c.profile_id) ?? null,
      note: c.note,
    };
    if (c.profile_id === user.id) crewMineByEpisode.set(c.episode_id, seeker);
    else crewOthersByEpisode.set(c.episode_id, [...(crewOthersByEpisode.get(c.episode_id) ?? []), seeker]);
  }

  /* Pass meter. The allowance is spent against an episode's DEPARTURE month —
     that is what rsvp_guard counts — but this read the current calendar month,
     so a member aboard a September episode was shown August's untouched
     allowance while September's was gone. It follows the next episode they
     could actually claim, and says which month it is talking about. */
  const plan = planRes.data;
  const nextAhead = episodes
    .filter((v) => new Date(v.starts_at).getTime() > nowMs)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const meterMonth = nextAhead ? new Date(nextAhead.starts_at) : now;
  const passesUsed =
    (usageRes.data ?? []).find((u) => {
      if (!u.month) return false;
      const m = new Date(u.month);
      return (
        m.getUTCFullYear() === meterMonth.getUTCFullYear() &&
        m.getUTCMonth() === meterMonth.getUTCMonth()
      );
    })?.passes_used ?? 0;
  const monthName = meterMonth.toLocaleString("en-US", { month: "long" }).toUpperCase();
  /* Model C: the value of a paid tier is a monthly credit, not a count of
     passes. events_per_month is 0 on every live plan, so the old meter read
     its false branch — "PASSES À LA CARTE" — to a member paying $225 a month
     for a $290 credit. The credit is this calendar month's; the pass count
     stays for any plan that still meters that way. */
  const creditLeft = typeof creditRes.data === "number" ? creditRes.data : 0;
  const creditMonth = now.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const passMeter = plan
    ? plan.monthly_credit_cents > 0
      ? `${creditLeft > 0 ? price(creditLeft) : "$0"} OF ${price(plan.monthly_credit_cents)} CREDIT LEFT · ${creditMonth}`
      : plan.events_per_month > 0
        ? `${passesUsed} OF ${plan.events_per_month} PASSES USED · ${monthName}`
        : "PASSES À LA CARTE"
    : null;
  const earlyDays = plan?.early_days ?? 0;

  /* The class ceiling is the second gate, and it used to be invisible: an
     odyssey episode looked claimable to everyone and the guard refused it at
     submit ("this episode runs past your class tier"). A pass you cannot claim
     should read as locked, not as an invitation. */
  const CLASS_RANK: Record<string, number> = {
    excursion: 0, passage: 0, overland: 1, expedition: 1, trek: 2, odyssey: 2,
  };
  const myCeiling = CLASS_RANK[plan?.class_ceiling ?? "passage"] ?? 0;
  const pastMyClass = (v: { sub_class: string | null }) =>
    v.sub_class ? (CLASS_RANK[v.sub_class] ?? 0) > myCeiling : false;

  const myRank = TIER_RANK[profile?.tier ?? "regional"] ?? 0;
  const myTier = profile?.tier ?? "regional";

  /* The home-city lock, the same way. rsvp_guard boards a Regional member
     only on an episode that leaves from their home city; an episode with no
     city is open to everyone, National and Global sail every city, and staff
     pass through. Two refusals, each said here before the guard says it: no
     city chosen yet, or the wrong one. The column is still home_city. */
  const CITY = PLACE.market.toLowerCase();
  const harborName = new Map<string, string>(
    (citiesRes.data ?? []).map((h) => [h.id, h.name] as const)
  );
  const cityLock = (v: { city_id: string | null }): "unset" | "mismatch" | null => {
    if (myTier !== "regional" || profile?.is_staff || !v.city_id) return null;
    if (!profile?.home_city) return "unset";
    return profile.home_city === v.city_id ? null : "mismatch";
  };

  /* Every reason a NEW pass cannot be claimed, in the order the guard would
     refuse them, with the door each one opens. Null means the row is open.
     A pass the member already holds is never swallowed by this — the control
     reads the note beside the standing instead. */
  type Lock = { note: string; link?: { href: string; label: string } };
  const lockFor = (v: Episode): Lock | null => {
    if (onHold) return { note: "Your membership is paused. Resume it on your page to claim a pass." };
    if (pastMyClass(v))
      return {
        note: `This episode runs past your class. ${v.sub_class ? v.sub_class.charAt(0).toUpperCase() + v.sub_class.slice(1) : "It"} passes open on a deeper plan.`,
      };
    if ((TIER_RANK[v.min_tier] ?? 0) > myRank)
      return { note: `${TIER_LABEL[v.min_tier]} passes open at ${TIER_LABEL[v.min_tier]} tier.` };
    const city = cityLock(v);
    if (city === "unset")
      return {
        note: `Regional passes sail from your home ${CITY} — choose it on your page.`,
        link: { href: "/you", label: `Choose your ${CITY}` },
      };
    if (city === "mismatch")
      return {
        note: `Regional passes sail from your home ${CITY} — this one leaves from ${
          (v.city_id && harborName.get(v.city_id)) || `another ${CITY}`
        }. National sails every US ${CITY}.`,
      };
    return null;
  };

  /* The drop hour, on THIS member's clock: rsvp_guard refuses before
     sale_opens_at less one presale step per tier above regional. NULL is the
     old world — no drop, the plan's window alone. */
  const tierOpensMs = (v: Episode): number | null =>
    v.sale_opens_at ? Date.parse(v.sale_opens_at) - myRank * v.presale_hours * 3600 * 1000 : null;
  const formatOf = (v: Episode) => (v.series ? seriesBySlug.get(v.series) ?? null : null);
  const sellsPasses = (v: Episode) => {
    const access = formatOf(v)?.access;
    return access !== "invite" && access !== "on_request";
  };

  /* Split draws are written shoreside — offered only when the club can. */
  const splitOffered = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  /* The single recommended pass: soonest open, unclaimed, within tier and window. */
  const recommendedId =
    episodes.find((v) => {
      const cap = capacity.get(v.id);
      const left = cap?.passes_left ?? v.passes_total;
      const r = mine.get(v.id);
      const opens = tierOpensMs(v);
      return (
        v.status === "scheduled" &&
        (TIER_RANK[v.min_tier] ?? 0) <= myRank &&
        !pastMyClass(v) &&
        !cityLock(v) &&
        left > 0 &&
        nowMs >= new Date(v.starts_at).getTime() - earlyDays * 86400000 &&
        (opens == null || nowMs >= opens) &&
        !compositionIds.has(v.id) &&
        sellsPasses(v) &&
        (!r || r.status === "not_going")
      );
    })?.id ?? null;

  return (
    <div>
      {/* This page is where a pass is claimed and held; the public Episodes
          page is where episodes are browsed. The old name for it was the
          manifest, which is the boarding list the club draws from these claims
          — a back-of-house document, and the standfirst says so instead of the
          heading. Season is not available: it means the calendar frame and the
          membership cycle, and Season I would have collided with it. */}
      <span className="mbr-eyebrow">Every episode ahead</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Passes.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 8, maxWidth: "52ch" }}>
        Every episode ahead, and the pass on each one. Passes are few by design.
        Claim one{profile?.tier === "global" ? ", bring up to two guests," : ""} or hold the
        waitlist — releases go out in order.
      </p>
      {passMeter ? (
        <div className="mbr-mono" style={{ marginTop: 10 }}>
          {passMeter}
        </div>
      ) : null}

      <TransferInbox offers={inbound} />

      {episodes.length === 0 ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Sailboat"
            title="Nothing on the calendar."
            detail="The next season is being drawn. It lands in your Inbox."
          />
        </div>
      ) : (
        <div className="voy-list">
          {episodes.map((v, i) => {
            const cap = capacity.get(v.id);
            const left = cap?.passes_left ?? v.passes_total;
            const aboard = cap?.aboard ?? 0;
            const r = mine.get(v.id) ?? null;
            const lock = lockFor(v);
            /* Booking window: opens early_days ahead of departure, per plan. */
            const start = new Date(v.starts_at);
            const opensMs = start.getTime() - earlyDays * 86400000;
            const planNote =
              nowMs < opensMs
                /* On the harbour's clock, because the database's refusal names
                   the harbour's day. These two disagreed: the banner said
                   "MAR 31" and the guard said "Apr 01" for the same episode. */
                ? `THE WINDOW OPENS ${logDate(new Date(opensMs).toISOString(), v.time_zone)} ON YOUR PLAN`
                : null;
            /* The drop hour, when the episode has one and it is still ahead
               for this tier. Both gates must pass; the later one is the note. */
            const saleOpens = tierOpensMs(v);
            const earlyHours = myRank * v.presale_hours;
            const saleNote =
              saleOpens != null && nowMs < saleOpens
                ? `ON SALE ${logDateTime(new Date(saleOpens).toISOString(), v.time_zone)}${
                    earlyHours > 0 ? ` · ${earlyHours}H EARLY ON ${TIER_LABEL[myTier].toUpperCase()}` : ""
                  }`
                : null;
            const windowNote =
              saleNote && planNote
                ? (saleOpens as number) > opensMs
                  ? saleNote
                  : planNote
                : (saleNote ?? planNote);
            const format = formatOf(v);
            /* The bow daybed rides on Sea formats. An unfiled episode (no
               format yet) falls back to its class, which is the same question
               asked of an older column. */
            const daybedWater = format ? format.category === "sea" : v.setting === "sea";
            /* Add-on upsell stays open until 18:00 the night before. */
            /* 18:00 on the harbour's wall the night before — not 18:00 wherever
               this page happens to be rendered. */
            const addonCutoff = new Date(eveningBefore(v.starts_at, v.time_zone));
            /* Display only — knots land by trigger on completion (legacy fathoms_* plumbing). */
            const baseFm =
              v.kind === "port_day" ? 40 : v.distance_nm != null ? v.distance_nm * 10 : null;
            const knotsOnCompletion =
              baseFm != null ? Math.round(baseFm * (v.knots_multiplier ?? 1)) : null;
            /* The badge names the series and how long it runs — the card says
               what this is, not how it is filed. Where there is no series it
               names the setting; Special was tried and marked every card,
               because a null series today means unfiled rather than
               deliberately standalone. An episode with no stated end drops the
               hours rather than guessing them. */
            const hours = durationChip(v.starts_at, v.ends_at);
            const badge = [format?.label ?? SETTING_LABEL[v.setting] ?? "Afloat", hours]
              .filter(Boolean)
              .join(" · ");
            const meta = [
              logDate(v.starts_at, v.time_zone),
              logTime(v.starts_at, v.time_zone),
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
                  eyebrow={badge}
                  title={v.title}
                  meta={meta}
                  footer={
                    <PassControls
                      episodeId={v.id}
                      voyageTitle={v.title}
                      myStatus={r?.status ?? null}
                      guests={r?.guests ?? 0}
                      guestNames={r?.guest_names ?? []}
                      passesLeft={left}
                      weatherHold={v.status === "weather_hold"}
                      guestsAllowed={profile?.tier === "global"}
                      locked={!!lock}
                      lockedNote={lock?.note ?? ""}
                      lockedLink={lock?.link}
                      windowNote={windowNote}
                      recommended={v.id === recommendedId}
                      priceCents={v.price_cents}
                      creditLeftCents={creditLeft}
                      depositRequired={v.deposit_required}
                      depositCents={v.deposit_cents}
                      daybedHeld={r ? daybedPasses.has(r.id) : false}
                      addons={addons}
                      attachedAddonIds={r ? attachedByPass.get(r.id) ?? [] : []}
                      addonWindowOpen={nowMs < addonCutoff.getTime()}
                      knotsOnCompletion={knotsOnCompletion}
                      fullCredit={start.getTime() - nowMs > creditWindowMs}
                      creditHours={creditHours}
                      paused={onHold}
                      composition={compositionIds.has(v.id)}
                      daybed={daybedWater ? daybedOffer : null}
                      enquiryHref={format?.access === "on_request" ? `/episodes/${v.slug}` : null}
                      inviteOnly={format?.access === "invite"}
                      boardingCode={r?.status === "aboard" ? r.boarding_code : null}
                      passId={r?.id ?? null}
                      waitlistPosition={positionByEpisode.get(v.id) ?? null}
                      autoClaim={r?.auto_claim ?? true}
                      members={members}
                      standingOffer={r ? offeredByPass.get(r.id) ?? null : null}
                      guestStubs={r ? guestsByPass.get(r.id) ?? [] : []}
                      partner={r ? partnerByPass.get(r.id) ?? null : null}
                      crewMine={crewMineByEpisode.get(v.id) ?? null}
                      crewSeekers={crewOthersByEpisode.get(v.id) ?? []}
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
                                  c.sleeps -
                                  (cabinClaims ?? []).filter(
                                    (cl) => cl.cabin_id === c.id && cl.episode_id === v.id
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
