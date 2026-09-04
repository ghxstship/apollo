import type { Metadata } from "next";
import { LockupText, Wordmark } from "@/components/ds";

import { logDate, logTime } from "@/lib/format";
import {
  BACKGROUND_LINE,
  BACKGROUND_STATES,
  BACKGROUND_LABEL,
  BACKGROUND_TONE,
  isSegment,
  type BoundaryRow,
  type PreferenceSheetRow,
  type Segment,
  type SegmentCapacityRow,
  type VettingStateRow,
  type WaitlistRow,
} from "@/lib/vetting";
import { getMember } from "../data";
import { moduleTables } from "@/lib/module-tables";
import { GatePanel } from "./gate-panel";
import { QueuePanel, type QueueRow } from "./queue-panel";
import { SheetPanel } from "./sheet-panel";
import "./vetting.css";

export const metadata: Metadata = { title: "Vetting" };

/* Vetting — the member's own file, their Preference Sheet, and the ratio gate on
   the next episode that has one.

   The kit's own funnel panel is NOT here, and that is a decision rather than an
   omission. It renders club-wide counts — 2,410 applied, 312 lifestyle vetted,
   40 seated — and its own caption says "the funnel is a filter, not a
   scoreboard", while the acceptance card's says the club "never implies
   competition with other applicants". Six ratios ending in 40 shown to one of
   the applicants is exactly that implication. A member sees their own six gates;
   the aggregate belongs on a crew surface.

   The eyebrow is [un] Scripted, which is now the kit's own word for it: the
   revision of this kit that this page was first built against read "UNHINGED
   DATING" in the header strip, a string the lexicon guard catches because the
   rebrand retired it. Twenty-one sibling kits in templates/ still carry the old
   name, so the rename is partway through the set and a kit is not on its own
   authority for a brand string. */

interface EpisodeRow {
  id: string;
  title: string;
  starts_at: string;
  time_zone: string;
  passes_total: number;
  held_passes: number;
}

export default async function VettingPage() {
  const { supabase, user, profile } = await getMember();
  const db = moduleTables(supabase);

  /* The next episode that is ratio-gated. "Gated" is the presence of cap rows
     rather than a flag on the episode, so this asks the caps which episodes they
     belong to and then takes the soonest — no second column to fall out of sync
     with the ceilings it is meant to describe. */
  const { data: upcoming } = await supabase
    .from("episodes")
    .select("id, title, starts_at, time_zone, passes_total, held_passes")
    .in("status", ["scheduled", "live"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(12);

  const ids = (upcoming ?? []).map((v) => v.id);
  const { data: caps } = ids.length
    ? await db.from("episode_segment_capacity").select("*").in("episode_id", ids)
    : { data: [] as SegmentCapacityRow[] };

  const gatedId = (upcoming ?? []).find((v) => (caps ?? []).some((c) => c.episode_id === v.id))?.id ?? null;
  const sailing = ((upcoming ?? []) as EpisodeRow[]).find((v) => v.id === gatedId) ?? null;
  const rows = ((caps ?? []) as SegmentCapacityRow[]).filter((c) => c.episode_id === gatedId);

  const [{ data: state }, { data: sheet }, { data: boundaries }, { data: passes }, { data: line }, { data: claimSetting }] =
    await Promise.all([
      db.from("own_vetting_state").select("*").maybeSingle(),
      db.from("preference_sheets").select("*").eq("profile_id", user.id).maybeSingle(),
      db.from("preference_boundaries").select("*").eq("profile_id", user.id),
      gatedId
        ? db.from("passes").select("id, segment, status").eq("profile_id", user.id).eq("episode_id", gatedId)
        : Promise.resolve({ data: [] }),
      gatedId
        ? db.from("waitlist_entries").select("*").eq("profile_id", user.id).eq("episode_id", gatedId)
        : Promise.resolve({ data: [] }),
      /* How long an offer stands — the club's own figure. Every sentence on
         this page that used to say "six hours" reads this instead. */
      supabase.rpc("club_setting", { p_key: "waitlist_claim_hours" }),
    ]);
  const claimHours = typeof claimSetting === "number" && claimSetting > 0 ? claimSetting : null;

  /* The crew's view of the same queue. Staff only, and fetched only for staff —
     RLS would return their own row and nothing else to a member, so an
     unconditional query would quietly render an empty crew panel to everybody. */
  const { data: queue } = profile?.is_staff && gatedId
    ? await db.from("waitlist_entries").select("id, segment, place, offered_at, claim_expires_at, claimed_at, released_at").eq("episode_id", gatedId).order("place")
    : { data: [] };

  const file = (state ?? null) as VettingStateRow | null;
  const seated = (passes ?? []).find((p) => p.status === "aboard");
  const mySegment: Segment | null = seated && isSegment(seated.segment) ? seated.segment : null;

  /* The second head on a couple pass — one pass_guests row, kind 'partner'.
     Read only when there is a couple seat to read it for. */
  const { data: partnerRow } =
    seated && mySegment === "couple"
      ? await supabase
          .from("pass_guests")
          .select("name")
          .eq("rsvp_id", seated.id)
          .eq("kind", "partner")
          .maybeSingle()
      : { data: null };
  const myPartner: string | null = partnerRow?.name ?? null;
  const myLine = ((line ?? []) as WaitlistRow[]).find((l) => !l.released_at) ?? null;

  /* The six gates, as the member's own checklist. Same six names the kit's
     funnel uses, read as a state rather than as a rate. */
  /* WHO HOLDS EACH GATE, which the checklist never said.

     Two of the six a member cannot act on at any price — ID verification and
     background clearance are the club's to do — and a third is only reachable
     once those clear. Shown as six identical unchecked boxes, the page asked a
     member to work out for themselves whether they were the hold-up or we were,
     and the booking guard's refusal ("the vetting file is not open yet") sent
     them here to find out. It did not tell them.

     So each gate says whose move it is. "Yours" is a thing to go and do, and
     the row links to it; "ours" is a thing to wait for, and saying so is the
     difference between a queue and a dead end. */
  const gates: Array<[string, boolean, "yours" | "ours"]> = [
    ["Applied", true, "yours"],
    ["ID and age verified", !!file?.id_verified && !!file?.age_ok, "ours"],
    ["Background cleared", file?.background_state === "cleared", "ours"],
    ["Preference Sheet complete", !!sheet?.completed_at, "yours"],
    [
      "Lifestyle vetted",
      file?.background_state === "cleared" && !!sheet?.completed_at,
      "ours",
    ],
    ["Seated this episode", !!mySegment, "yours"],
  ];
  /* Nothing has been opened at all — not "in progress", not started. A member
     in this state is waiting on a person, and the page should say so rather
     than showing five zeroes and letting them guess. */
  const fileUnopened = !file;
  const yoursOutstanding = gates.filter(([, done, whose]) => !done && whose === "yours").length;

  return (
    <div className="ls-fade vet-stack">
      <div>
        <span className="mbr-eyebrow"><LockupText division="scripted" /></span>
        <h1 className="mbr-h1">Vetting.</h1>
        <p className="vet-note" style={{ marginTop: 10 }}>
          Every sale passes the ratio gate, capacity is shown by segment and never
          as one number, and a decline is final and unexplained.
        </p>
      </div>

      {/* Acceptance carries the mark. The kit sets the parent anchor on the
          acceptance card — the umbrella speaking, not a division — so the
          suffix is null here. */}
      {mySegment && sailing ? (
        <section className="mbr-sec">
          <div className="vet-panel" style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="vet-eyebrow" style={{ color: "var(--text-accent)" }}>
                Accepted · {sailing.title}
              </span>
              <Wordmark size="sm" suffix={null} />
            </div>
            <p className="mbr-h1" style={{ fontSize: "var(--text-2xl)" }}>You are on the manifest</p>
            <p className="vet-note">
              Waiver and Riviera Code open 48 hours out. The marina pin drops 24
              hours out, encrypted.
            </p>
          </div>
        </section>
      ) : null}

      <div className="vet-grid">
        {/* Your file */}
        <div className="vet-panel">
          <span className="vet-eyebrow">Your file · six gates</span>
          {/* The answer, before the checklist. A member opens this page to find
              out how far along they are, and had to count six rows to learn it. */}
          <p className="vet-cleared">
            {gates.filter(([, done]) => done).length} of {gates.length} cleared
          </p>
          <div>
            {gates.map(([label, done, whose], i) => (
              <div className="vet-row" key={label}>
                <span className="vet-row__label">{String(i + 1).padStart(2, "0")}</span>
                <span className="vet-gate">{label}</span>
                {/* An open gate says whose move it is. A cleared one does not:
                    once it is done, who did it stops mattering. */}
                {done ? null : (
                  <span className="vet-whose">{whose === "yours" ? "your move" : "with us"}</span>
                )}
                <span
                  className="vet-row__token"
                  style={{ color: done ? "var(--positive)" : "var(--text-faint)" }}
                >
                  {done ? "DONE" : "OPEN"}
                </span>
              </div>
            ))}
          </div>
          {/* The sentence the booking refusal sends people here to find. */}
          <p className="vet-standing">
            {fileUnopened
              ? yoursOutstanding > 0
                ? "Your file has not been opened yet. Finish the Preference Sheet below and the vetting team takes it from there — they write when it moves."
                : "Your file has not been opened yet. Nothing is needed from you; the vetting team writes when it moves."
              : yoursOutstanding > 0
                ? "The open gates below marked your move are yours to finish. The rest are with the vetting team."
                : "Everything left is with the vetting team. They write when it moves."}
          </p>
          <p className="vet-note">
            Ages 25 to 45, no exceptions. Your ID is deleted 30 days after your
            last episode, and it never leaves the vetting file.
          </p>
        </div>

        {/* Background check */}
        <div className="vet-panel">
          <span className="vet-eyebrow">Background check</span>
          <div className="vet-states">
            {BACKGROUND_STATES.map((s) => {
              const mine = file?.background_state === s;
              return (
                <div
                  key={s}
                  className={`vet-state${mine ? " vet-state--mine" : ""}`}
                  style={{ borderInlineStartColor: BACKGROUND_TONE[s] }}
                  aria-current={mine ? "step" : undefined}
                >
                  <span className="vet-state__name" style={{ color: BACKGROUND_TONE[s] }}>
                    {BACKGROUND_LABEL[s]}
                  </span>
                  <span className="vet-state__line">{BACKGROUND_LINE[s]}</span>
                </div>
              );
            })}
          </div>
          <p className="vet-note">
            {file?.fast_track
              ? "Your membership fast-tracks clearance. It is a benefit of the membership and has never been for sale."
              : "Fast-track clearance is a membership benefit, never a purchasable upgrade."}
          </p>
        </div>

        {/* The gate, or the reason there is nothing to gate */}
        {sailing && rows.length ? (
          <GatePanel
            episodeId={sailing.id}
            title={sailing.title}
            when={`${logDate(sailing.starts_at, sailing.time_zone)} · ${logTime(sailing.starts_at, sailing.time_zone)}`}
            rows={rows}
            hull={Math.max((sailing.passes_total ?? 0) - (sailing.held_passes ?? 0), 0)}
            mySegment={mySegment}
            myPartner={myPartner}
            myLine={myLine}
            claimHours={claimHours}
            claimUntilLabel={
              myLine?.claim_expires_at && sailing
                ? `${logDate(myLine.claim_expires_at, sailing.time_zone)} · ${logTime(myLine.claim_expires_at, sailing.time_zone)}`
                : null
            }
          />
        ) : (
          <div className="vet-panel">
            <span className="vet-eyebrow">Capacity by segment</span>
            <p className="vet-title">Nothing seats by segment yet.</p>
            <p className="vet-note">
              The ratio gate runs on episodes that carry a composition. When the
              next one opens, the seats show here by segment — women, men and
              couples — and never as one number.
            </p>
          </div>
        )}
      </div>

      {profile?.is_staff && sailing && rows.length ? (
        <section className="mbr-sec">
          <QueuePanel
            episodeId={sailing.id}
            rows={(queue ?? []) as QueueRow[]}
            capacity={rows}
            asOf={new Date().getTime()}
            claimHours={claimHours}
          />
        </section>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">Preference Sheet</span>
        <p className="vet-note" style={{ marginBottom: 16 }}>
          Three parts — drinks, boundaries, green and red flags. Answers are
          never shown to other guests.
        </p>
        <SheetPanel
          sheet={(sheet ?? null) as PreferenceSheetRow | null}
          boundaries={(boundaries ?? []) as BoundaryRow[]}
        />
      </section>

    </div>
  );
}
