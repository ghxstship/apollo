import { LOGBOOK, MARK_KIND } from "@/lib/brand";
import { logDate } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

/* The Passage Log — a member's record, computed on read from completed sailings.
   It is a logbook, not a score: nothing here compares one member to another, and
   there is no rank to fall down. Marks sit alongside it as permanent typographic
   marks rather than badges — the design system asks for hairlines, not colour. */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Log = {
  sailings: number;
  nmLogged: number;
  hoursAtSea: number;
  harborsMade: number;
  vesselsSailed: number;
  crewMet: number;
  firstSailAt: string | null;
  marksHeld: number;
};

export type Mark = {
  code: string;
  name: string;
  blurb: string;
  kind: string;
  held: boolean;
  conferredAt: string | null;
};

/* One round trip for the aggregates, one for the marks. Both fail soft: a member
   with no history reads as a member with no history, never as an error. */
export async function readPassageLog(
  supabase: Supabase,
  profileId: string
): Promise<{ log: Log | null; marks: Mark[] }> {
  const [logRes, catalogueRes, heldRes] = await Promise.all([
    supabase.rpc("passage_log", { p_profile_id: profileId }),
    supabase.from("marks").select("*").eq("active", true).order("position", { ascending: true }),
    supabase.from("member_marks").select("*").eq("profile_id", profileId),
  ]);

  const row = Array.isArray(logRes.data) ? logRes.data[0] : null;
  const log: Log | null = row
    ? {
        sailings: Number(row.sailings ?? 0),
        nmLogged: Number(row.nm_logged ?? 0),
        hoursAtSea: Number(row.hours_at_sea ?? 0),
        harborsMade: Number(row.harbors_made ?? 0),
        vesselsSailed: Number(row.vessels_sailed ?? 0),
        crewMet: Number(row.crew_met ?? 0),
        firstSailAt: row.first_sail_at ?? null,
        marksHeld: Number(row.marks_held ?? 0),
      }
    : null;

  const conferred = new Map(
    (heldRes.data ?? []).map((m) => [m.mark_code, m.conferred_at] as const)
  );
  const marks: Mark[] = (catalogueRes.data ?? []).map((m) => ({
    code: m.code,
    name: m.name,
    blurb: m.blurb,
    kind: m.kind,
    held: conferred.has(m.code),
    conferredAt: conferred.get(m.code) ?? null,
  }));

  return { log, marks };
}

function nm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function PassageLog({
  log,
  marks,
  own,
}: {
  log: Log | null;
  marks: Mark[];
  own: boolean;
}) {
  const sailed = (log?.sailings ?? 0) > 0;
  const held = marks.filter((m) => m.held);
  const open = marks.filter((m) => !m.held);

  return (
    <section className="plog">
      <div className="plog-head">
        <span className="mbr-eyebrow">{LOGBOOK.log}</span>
        {sailed && log?.firstSailAt ? (
          <span className="mbr-mono plog-since">SINCE {logDate(log.firstSailAt)}</span>
        ) : null}
      </div>

      {!sailed ? (
        <p className="plog-empty">
          {own
            ? "Nothing logged yet. The log starts on your first sailing — not before."
            : "No sailings logged yet."}
        </p>
      ) : (
        <>
          <dl className="plog-figs">
            <div>
              <dt>Nautical miles</dt>
              <dd>{nm(log!.nmLogged)}</dd>
            </div>
            <div>
              <dt>Sailings</dt>
              <dd>{log!.sailings}</dd>
            </div>
            <div>
              <dt>Hours at sea</dt>
              <dd>{Math.round(log!.hoursAtSea)}</dd>
            </div>
            <div>
              <dt>Harbors</dt>
              <dd>{log!.harborsMade}</dd>
            </div>
            <div>
              <dt>Hulls</dt>
              <dd>{log!.vesselsSailed}</dd>
            </div>
            <div>
              <dt>Crew met</dt>
              <dd>{log!.crewMet}</dd>
            </div>
          </dl>

          {held.length > 0 ? (
            <div className="plog-marks">
              <span className="mbr-eyebrow plog-sub">
                {LOGBOOK.marks} {LOGBOOK.markVerb}
              </span>
              <ul>
                {held.map((m) => (
                  <li key={m.code}>
                    <span className="plog-mark-name">{m.name}</span>
                    <span className="plog-mark-blurb">{m.blurb}</span>
                    <span className="mbr-mono plog-mark-when">
                      {MARK_KIND[m.kind] ?? ""}
                      {m.conferredAt ? ` · ${logDate(m.conferredAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Only your own log shows what is still ahead. Reading another
              member's page should not read as a list of what they lack. */}
          {own && open.length > 0 ? (
            <div className="plog-marks plog-marks--open">
              <span className="mbr-eyebrow plog-sub">Still ahead</span>
              <ul>
                {open.map((m) => (
                  <li key={m.code}>
                    <span className="plog-mark-name">{m.name}</span>
                    <span className="plog-mark-blurb">{m.blurb}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
