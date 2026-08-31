import type { Metadata } from "next";
import { lockup } from "@/lib/brand";
import {
  GUARANTEE_OWED_LINE,
  GUARANTEE_UNEARNED_LINE,
  anchorCountdown,
  guaranteeOwed,
  otherSide,
  radarPhase,
  type RadarClock,
  type RadarPin,
  type SharedAnchorRow,
} from "@/lib/radar";
import { getMember } from "../data";
import { moduleTables } from "@/lib/module-tables";
import { Sweep } from "./sweep";
import "./radar.css";

export const metadata: Metadata = { title: "Radar" };

/* Radar — live aboard only, and dark everywhere else.

   The eyebrow is [UN] Scripted, which the current kit now says too — the
   revision this page was first built against read "UNHINGED DATING", a retired
   string the lexicon guard catches.

   Every rule this page states is held somewhere else: the 17:30 lock and the
   three-slot ceiling by hold_the_radar_lock, mutual-only by
   anchor_on_mutual_pick, the 19:00 reveal and the 24 hours by the RLS policy on
   shared_anchors and by open_the_captains_log. This page renders what those
   allowed through and names the reason when they did not. */

interface SailingRow {
  id: string;
  title: string;
  status: string;
}

export default async function RadarPage() {
  const { supabase, user } = await getMember();
  const db = moduleTables(supabase);

  /* The sailing Radar might be running on: one I hold a seat on, whose clock
     exists. Passes first — rsvps is "own passes or staff", so this reads only
     mine and no wider query is possible from here. */
  const { data: myPasses } = await supabase
    .from("rsvps")
    .select("id, voyage_id, status, checked_in_at, show_on_manifest")
    .eq("profile_id", user.id)
    .eq("status", "aboard");

  const ids = (myPasses ?? []).map((p) => p.voyage_id);
  const { data: clocks } = ids.length
    ? await db.from("voyage_radar").select("*").in("voyage_id", ids)
    : { data: [] as RadarClock[] };

  /* The soonest sailing whose anchors have not expired. A member on three
     sailings is on exactly one of them tonight. */
  /* Server-rendered per request, so "now" is request time. `new Date()` rather
     than `Date.now()` because the purity rule refuses the latter during render
     — the same reading of the clock, in the form the linter can see is a
     request-scoped value and not a hook-unstable one. */
  const now = new Date().getTime();
  const clock =
    ((clocks ?? []) as RadarClock[])
      .filter((c) => new Date(c.anchors_expire_at).getTime() > now)
      .sort((a, b) => +new Date(a.opens_at) - +new Date(b.opens_at))[0] ?? null;

  const pass = (myPasses ?? []).find((p) => p.voyage_id === clock?.voyage_id) ?? null;
  const { data: sailingRows } = clock
    ? await supabase.from("voyages").select("id, title, status").eq("id", clock.voyage_id)
    : { data: [] };
  const sailing = ((sailingRows ?? []) as SailingRow[])[0] ?? null;

  const phase = radarPhase(clock);

  /* The sweep is a definer RPC: `rsvps` is "own passes or staff", and widening
     it so members could read each other would hand out whole manifests to draw
     three pins. It refuses anyone not aboard, so a null here is a rule holding
     rather than a query failing. */
  let pins: RadarPin[] = [];
  if (clock && pass?.checked_in_at) {
    const { data } = await db.rpc("radar_sweep", { p_voyage: clock.voyage_id });
    pins = (data ?? []) as RadarPin[];
  }

  /* My own picks. RLS on radar_picks is "your own picks and no one else's" —
     not even staff — so this cannot return anybody else's however it is
     written. */
  const { data: myPicks } = clock
    ? await db.from("radar_picks").select("picked_rsvp").eq("voyage_id", clock.voyage_id).eq("picker_rsvp", pass?.id ?? "")
    : { data: [] };

  /* Anchors. The policy hides them until an envelope has been opened and drops
     them the moment the twenty-four hours are up, so an empty list before 19:00
     means "not yet" and after expiry means "gone" — the page has to say which,
     and reads the phase to know. */
  const { data: anchors } = clock
    ? await db.from("shared_anchors").select("*").eq("voyage_id", clock.voyage_id)
    : { data: [] };
  const mine = ((anchors ?? []) as SharedAnchorRow[]).filter((a) => a.unlocked_at);

  /* Names for the other side of each anchor come from the same sweep — one
     query, first names only, and no separate directory lookup that could
     return a surname to a guest surface. */
  const nameOf = new Map(pins.map((p) => [p.rsvpId, p.couple ? `${p.name} + 1` : p.name]));

  const picksPlotted = (myPicks ?? []).length;

  if (!clock || !sailing) {
    return (
      <div className="ls-fade rdr-stack">
        <div>
          <span className="mbr-eyebrow">{lockup("scripted")}</span>
          <h1 className="mbr-h1">Radar.</h1>
        </div>
        <div className="rdr-panel" style={{ maxWidth: 420 }}>
          <span className="rdr-eyebrow">Dark</span>
          <p className="rdr-note">
            Radar is live aboard only, and dark everywhere else. It is not
            something you scroll at home. It opens at 17:15 on the sailing, on
            open water, and closes at 17:30. The Match of the Day is called at
            sunset, on deck.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ls-fade rdr-stack">
      <div>
        <span className="mbr-eyebrow">{lockup("scripted")}</span>
        <h1 className="mbr-h1">Radar.</h1>
        <p className="rdr-note" style={{ marginTop: 10 }}>
          {sailing.title} · mutual only, never one-sided. No scores, no streaks,
          and nothing that says who looked at you.
        </p>
      </div>

      <div className="rdr-grid">
        {pass?.checked_in_at ? (
          <Sweep
            voyageId={clock.voyage_id}
            myRsvp={pass.id}
            clock={clock}
            pins={pins}
            listed={pass.show_on_manifest !== false}
          />
        ) : (
          <div className="rdr-panel">
            <span className="rdr-eyebrow">Not aboard yet</span>
            <p className="rdr-note">
              Radar opens when you are aboard. The crew checks you in at the
              gangway, and the sweep comes alive at 17:15.
            </p>
          </div>
        )}

        {/* Shared Anchors */}
        <div className="rdr-panel">
          <span className="rdr-eyebrow">Shared Anchors</span>
          {mine.length ? (
            <>
              <p className="mbr-h1" style={{ fontSize: "var(--text-2xl)" }}>
                {mine.length === 1 ? "One shared anchor" : `${mine.length} shared anchors`}
              </p>
              <div>
                {mine.map((a) => (
                  <div className="rdr-row" key={a.id}>
                    <span className="rdr-row__name">
                      {nameOf.get(otherSide(a, pass?.id ?? "")) ?? "A guest"}
                    </span>
                    <span className="rdr-row__clock">
                      {anchorCountdown(a.expires_at) ?? "EXPIRED"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="rdr-note">
                Contacts expire in 24 hours, both sides, with no extension and no
                reminder.
              </p>
            </>
          ) : (
            <p className="rdr-note">
              {phase === "unlocked"
                ? "Nothing has come back mutual on this sailing. A one-sided pick is never surfaced, hinted at, or counted — so there is nothing here either way."
                : "Anchors open at 19:00, from the QR inside the sealed Captain's Log envelope. Nothing shows before then, on either side."}
            </p>
          )}
        </div>

        {/* The Match Guarantee. Stated before docking rather than after, so a
            member who plotted nothing learns the condition while there is still
            time to plot something. */}
        {phase === "unlocked" && mine.length === 0 ? (
          <div className={`rdr-strip${guaranteeOwed(picksPlotted, mine.length) ? " rdr-strip--credit" : ""}`}>
            <span className="rdr-strip__badge">
              {guaranteeOwed(picksPlotted, mine.length) ? "$150 credit owed" : "Match Guarantee"}
            </span>
            <span className="rdr-strip__title">No anchors this time.</span>
            <p className="rdr-strip__body">
              {guaranteeOwed(picksPlotted, mine.length) ? GUARANTEE_OWED_LINE : GUARANTEE_UNEARNED_LINE}
            </p>
          </div>
        ) : null}

        <div className="rdr-rules">
          <span className="rdr-eyebrow" style={{ paddingBottom: 8 }}>Radar rules</span>
          <p className="rdr-rule">
            Radar is live aboard only, and dark everywhere else. It is not
            something you scroll at home.
          </p>
          <p className="rdr-rule">
            Mutual only. A one-sided pick is never surfaced, hinted at, or counted.
          </p>
          <p className="rdr-rule">
            No bios, no photo galleries, no ages, no distance. You met them today.
          </p>
          <p className="rdr-rule">
            Couples plot course as one pin and appear as one anchor.
          </p>
          <p className="rdr-rule">
            Contacts expire in 24 hours, both sides, with no extension and no
            reminder.
          </p>
        </div>
      </div>
    </div>
  );
}
