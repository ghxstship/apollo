import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockupText } from "@/components/ds";
import { logDate } from "@/lib/format";
import {
  FIVE_A_LABEL,
  FIVE_A_PHASES,
  WEATHER_CLASSES,
  WEATHER_LINE,
  WEATHER_TONE,
  boardWindow,
  type DeckState,
  type ElementRow,
  type PodSessionRow,
  type RunOfShowRow,
} from "@/lib/show";
import { FIVE_A_COVERS } from "@/types/elements";
import { getMember } from "../data";
import { moduleTables } from "@/lib/module-tables";
import { BoardControls, PodQueue, SignalFlags } from "./bridge";
import "./show.css";

export const metadata: Metadata = { title: "Show" };

/* Show — the run of show, the deck state, the Pod queue, and the two
   classification axes. A crew surface: surnames appear here and nowhere a guest
   can read, which is the inverse of every other member screen.

   The Five-A band is a greyscale ramp in arc order, per brand-architecture.md:
   operational state is numerals on the noir/ivory scale and never a division
   hue, because a phase in magenta reads as a brand and a phase in grey reads as
   a position. */

const ARC_FILL = ["var(--ivory-50)", "var(--ivory-500)", "var(--text-faint)", "var(--noir-500)", "var(--noir-800)"];
const ARC_INK = ["var(--noir-900)", "var(--noir-900)", "var(--noir-900)", "var(--ivory-100)", "var(--ivory-100)"];

const PHASE_WINDOW: Record<string, string> = {
  arrival: "11:00–12:00",
  atmosphere: "Continuous",
  appetite: "12:00–18:00",
  activity: "14:00–17:00",
  afterglow: "17:00 on",
};

const PHASE_OWNER: Record<string, string> = {
  arrival: "Boarding lead",
  atmosphere: "Chief Stew",
  appetite: "Bar lead",
  activity: "Deck crew",
  afterglow: "Producer",
};

interface SailingRow {
  id: string;
  title: string;
  starts_at: string;
  time_zone: string;
  deck_state: DeckState | null;
}

export default async function ShowPage() {
  const { supabase, profile } = await getMember();
  const db = moduleTables(supabase);

  /* Crew only, and gated the way every other crew surface in this app is gated:
     redirect("/home"), exactly as getOperator() does for the Bridge.
     notFound() was the first instinct — a 404 tells a member nothing about what
     lives here — but a second gating idiom for the same rule is worse than the
     small disclosure it saves. It means two behaviours to keep in step, two
     things for the route matrix to know about, and a member who lands here from
     a stale link gets a dead end instead of their own page.

     The database refuses every read on this page independently — run_of_show,
     pod_sessions, elements and element_substitutes are all is_staff() — so this
     is the second lock, not the only one. */
  if (!profile?.is_staff) redirect("/home");

  const { data: sailings } = await db
    .from("voyages")
    .select("id, title, starts_at, time_zone, deck_state")
    .in("status", ["live", "scheduled"])
    .order("starts_at", { ascending: true })
    .limit(1);

  const sailing = ((sailings ?? []) as SailingRow[])[0] ?? null;

  const [{ data: board }, { data: pods }, { data: elements }, { data: subs }] = await Promise.all([
    sailing
      ? db.from("run_of_show").select("*").eq("voyage_id", sailing.id).order("position")
      : Promise.resolve({ data: [] }),
    sailing
      ? db.from("pod_sessions").select("*").eq("voyage_id", sailing.id).order("position")
      : Promise.resolve({ data: [] }),
    db.from("elements").select("id, element_id, urid, name, department, five_a, weather, element_state, critical_path, total_cost_usd").order("element_id"),
    db.from("element_substitutes").select("element_id, context"),
  ]);

  const rows = (board ?? []) as RunOfShowRow[];
  const queue = (pods ?? []) as PodSessionRow[];
  const kit = (elements ?? []) as ElementRow[];

  /* Names for the queue, and the aboard passes the queue could still take.
     Two queries rather than a nested embed: the embed would depend on PostgREST
     resolving two hops of foreign key, and this surface is read on a wet deck
     where a silently empty column is worse than one extra round trip.

     The aboard read is the enqueue control's whole world: pod_sessions is
     unique on (voyage_id, rsvp_id), so a pass already queued is not offered
     again, and a pass that is not aboard is not offered at all. */
  const queuedIds = new Set(queue.map((q) => q.rsvp_id));
  const { data: aboard } = sailing
    ? await supabase
        .from("rsvps")
        .select("id, profile_id")
        .eq("voyage_id", sailing.id)
        .eq("status", "aboard")
    : { data: [] };
  const aboardIds = new Set((aboard ?? []).map((p) => p.id));
  /* A queued pass whose status has since moved off 'aboard' still needs its
     name on the board. */
  const strayIds = [...queuedIds].filter((id) => !aboardIds.has(id));
  const { data: strays } = strayIds.length
    ? await supabase.from("rsvps").select("id, profile_id").in("id", strayIds)
    : { data: [] };
  const passes = [...(aboard ?? []), ...(strays ?? [])];
  const profileIds = passes.map((p) => p.profile_id);
  const { data: people } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };
  const nameByProfile = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "A guest"]));
  const names = Object.fromEntries(
    passes.map((p) => [p.id, nameByProfile.get(p.profile_id) ?? "A guest"])
  );

  const candidates = (aboard ?? [])
    .filter((p) => !queuedIds.has(p.id))
    .map((p) => ({ id: p.id, name: nameByProfile.get(p.profile_id) ?? "A guest" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subsByElement = new Set((subs ?? []).map((s) => s.element_id));
  /* The specification error the whole substitution rule exists to catch, shown
     rather than enforced here — the database already refuses to commit one, so
     anything listed is a Draft or Retired row on its way to becoming a problem. */
  const unsubstituted = kit.filter(
    (e) => e.five_a === "activity" && e.weather === "indoor_only" && !subsByElement.has(e.id)
  );

  return (
    <div className="ls-fade shw-stack">
      <div>
        <span className="mbr-eyebrow"><LockupText division="limited" /></span>
        <h1 className="mbr-h1">Show.</h1>
        <p className="shw-strap" style={{ display: "block", marginTop: 10 }}>
          Crew surfaces · 24-hour local time · critical-path items carry the
          accent · the signal flag states the deck state so nobody has to ask
        </p>
      </div>

      {!sailing ? (
        <p className="shw-note">Nothing on the water. The board comes up when an episode is on the sheet.</p>
      ) : (
        <>
          {/* Run of show */}
          <div className="shw-panel">
            <div className="shw-head">
              <h2 className="shw-h2">Run of show</h2>
              <span className="shw-strap">
                Bridge board · {sailing.title} · {logDate(sailing.starts_at, sailing.time_zone)}
              </span>
            </div>

            {rows.length ? (
              <div className="shw-card shw-board">
                <div className="shw-board__row shw-board__row--head">
                  <span className="shw-c-window">Window</span>
                  <span className="shw-c-stage">Stage</span>
                  <span className="shw-c-cue">Operational cue</span>
                  <span className="shw-c-lead">Staff lead</span>
                  <span className="shw-c-sound">Sound</span>
                  <span className="shw-c-cp">CP</span>
                </div>
                {rows.map((r) => (
                  <div
                    className={`shw-board__row${r.critical_path ? " shw-board__row--cp" : ""}`}
                    key={r.id}
                  >
                    <span className="shw-c-window">{boardWindow(r.window_start, r.window_end)}</span>
                    <span className="shw-c-stage">{r.stage}</span>
                    <span className="shw-c-cue">{r.cue}</span>
                    <span className="shw-c-lead">{r.staff_lead ?? "—"}</span>
                    <span className="shw-c-sound">
                      {r.sound ?? "—"}
                      {r.bpm ? ` · ${r.bpm}` : ""}
                    </span>
                    <span className={`shw-c-cp${r.critical_path ? " shw-c-cp--yes" : ""}`}>
                      {r.critical_path ? "YES" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="shw-note">No board laid out for this episode yet.</p>
            )}

            <BoardControls voyageId={sailing.id} empty={rows.length === 0} />

            <p className="shw-note">
              CP marks critical path — the episode cannot proceed without it.
              Fixed column widths, never space-between: the board is read at a
              glance on a wet deck. Nothing here blocks a departure; a person
              decides, because a rule that strands a boat at a dock over a
              procurement record is worse than the gap it was guarding.
            </p>
          </div>

          {/* Signal flags */}
          <div className="shw-panel">
            <div className="shw-head">
              <h2 className="shw-h2">Signal flags</h2>
              <span className="shw-strap">
                One flag flies at a time · guests learn them in one episode ·
                geometry carries the meaning, never a division hue
              </span>
            </div>
            <SignalFlags voyageId={sailing.id} flying={sailing.deck_state} />
          </div>

          {/* Confessional Pod */}
          <div className="shw-panel">
            <div className="shw-head">
              <h2 className="shw-h2">Confessional Pod</h2>
              <span className="shw-strap">
                Voluntary · 90 seconds · anonymity on request is a hard state, not
                a preference
              </span>
            </div>
            <PodQueue voyageId={sailing.id} sessions={queue} names={names} candidates={candidates} />
          </div>
        </>
      )}

      {/* Five-A phases */}
      <div className="shw-panel">
        <div className="shw-head">
          <h2 className="shw-h2">Five-A phases</h2>
          <span className="shw-strap">
            Every element carries exactly one phase · numbered and greyscale ·
            a phase with no elements is a gap
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="shw-arc">
            {FIVE_A_PHASES.map((p, i) => (
              <span
                key={p}
                className="shw-arc__seg"
                style={{ background: ARC_FILL[i], color: ARC_INK[i] }}
              >
                <span>{i + 1}</span>
                <span>{FIVE_A_LABEL[p]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="shw-card">
          {FIVE_A_PHASES.map((p, i) => (
            <div className="shw-row" key={p}>
              <span className="shw-row__label">
                {i + 1} · {FIVE_A_LABEL[p]}
              </span>
              <span className="shw-row__label" style={{ width: 104, color: "var(--text-muted)" }}>
                {PHASE_WINDOW[p]}
              </span>
              <span className="shw-row__body">{FIVE_A_COVERS[p]}</span>
              <span className="shw-row__label" style={{ color: "var(--text-muted)" }}>
                {PHASE_OWNER[p]}
              </span>
            </div>
          ))}
        </div>

        <p className="shw-note">
          One phase per element. If something seems to span two, it is two
          elements with two owners. The band is a legend in arc order, not a
          timeline — Atmosphere and Afterglow have no bounded duration, so equal
          segments are deliberate. Read the window column for real times.
        </p>
      </div>

      {/* Weather class */}
      <div className="shw-panel">
        <div className="shw-head">
          <h2 className="shw-h2">Weather class</h2>
          <span className="shw-strap">
            Three classes · marine is the default aboard · every indoor_only
            element names its substitute before it is specified
          </span>
        </div>

        <div className="shw-grid">
          <div className="shw-card">
            {WEATHER_CLASSES.map((w) => (
              <div className="shw-row" key={w}>
                <span className="shw-row__label" style={{ color: WEATHER_TONE[w] }}>
                  {w}
                </span>
                <span className="shw-row__body">{WEATHER_LINE[w]}</span>
              </div>
            ))}
          </div>

          <div className="shw-card">
            <span className="shw-strap" style={{ paddingBottom: 8 }}>
              Substitution on a hold
            </span>
            {kit.length === 0 ? (
              <p className="shw-note">
                The elements catalogue is empty. Nothing is specified yet, so
                there is nothing to substitute.
              </p>
            ) : unsubstituted.length ? (
              <p className="shw-note" style={{ color: "var(--danger)" }}>
                {unsubstituted.map((e) => e.element_id).join(", ")} — indoor_only
                in the activity phase with no named substitute. The database
                refuses to make one of these Active; these are still Draft.
              </p>
            ) : (
              <p className="shw-note">
                Every indoor_only element in the activity phase names a
                substitute. A hold does not cancel a phase — it swaps the element.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
