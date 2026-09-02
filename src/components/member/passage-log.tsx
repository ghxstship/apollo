import { LOGBOOK, MARK_KIND, PLACE } from "@/lib/brand";
import { KitPassageLog, MarksList, type LogFigure, type MarkItem } from "@/components/ds";
import { logDate } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

/* The Passage Log — a member's record, computed on read from completed episodes.
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

/* Rendered with the kit's logbook components — the auto-fit figure grid and the
   marks rows are the design system's now, not bespoke CSS. Your own log shows
   what is still ahead; another member's does not. */
export function PassageLog({
  log,
  marks,
  own,
  zone,
}: {
  log: Log | null;
  marks: Mark[];
  own: boolean;
  /* Whose clock these dates are on. Null means the club's own. */
  zone: string | null;
}) {
  const sailed = (log?.sailings ?? 0) > 0;

  const figures: LogFigure[] = sailed
    ? [
        { value: nm(log!.nmLogged), label: "Nautical miles" },
        { value: String(log!.sailings), label: "Episodes" },
        { value: String(Math.round(log!.hoursAtSea)), label: "Hours at sea" },
        { value: String(log!.harborsMade), label: PLACE.markets },
        { value: String(log!.vesselsSailed), label: "Hulls" },
        { value: String(log!.crewMet), label: "Cast met" },
      ]
    : [];

  const items: MarkItem[] = marks.map((m) => ({
    kind: MARK_KIND[m.kind] ?? m.kind,
    name: m.name,
    detail: m.blurb,
    held: m.held,
    date: m.conferredAt ? logDate(m.conferredAt, zone) : undefined,
  }));

  return (
    <section className="plog">
      <div className="plog-head">
        <span className="mbr-eyebrow">{LOGBOOK.log}</span>
      </div>
      {!sailed ? (
        <KitPassageLog
          figures={[]}
          emptyLabel={
            own
              ? "Nothing logged yet. The log starts on your first episode — not before."
              : "No episodes logged yet."
          }
        />
      ) : (
        <>
          <KitPassageLog
            figures={figures}
            since={log?.firstSailAt ? logDate(log.firstSailAt, zone) : undefined}
            style={{ marginTop: 12 }}
          />
          <div className="plog-marks">
            <span className="mbr-eyebrow plog-sub">
              {LOGBOOK.marks} {LOGBOOK.markVerb}
            </span>
            <MarksList marks={items} showAhead={own} />
          </div>
        </>
      )}
    </section>
  );
}
