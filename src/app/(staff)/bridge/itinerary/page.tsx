import type { Metadata } from "next";
import { StateBlock } from "@/components/ds";
import { logDate, logTime } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { ItineraryClient, EpisodePicker, type LegRow, type StopRow } from "./itinerary-client";

export const metadata: Metadata = { title: "Itinerary" };

interface LegRecord {
  id: string;
  day: number;
  place: string;
  note: string | null;
  starts_at: string | null;
  status: "planned" | "revised" | "held";
  hold_reason: string | null;
  hold_new_plan: string | null;
  hold_unchanged: string | null;
}

interface StopRecord {
  id: string;
  leg_id: string | null;
  position: number;
  name: string;
  tender_at: string | null;
  last_return: string | null;
  notes: string | null;
}

/* An instant as the wall clock of the episode's zone, in the shape
   <input type="datetime-local"> wants — the same trap as the vetting screen:
   slicing an ISO string prints UTC, and an unedited field then saves the leg
   several hours from where it was. */
function wallClockField(iso: string | null, zone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/* "09:30:00" off a `time` column is not what a time field wants, and is not
   what a card should print either. */
const clock = (t: string | null) => (t ? t.slice(0, 5) : "");

export default async function ItineraryPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);
  const sp = await searchParams;

  const cutoff = new Date(new Date().getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const episodesRes = await supabase
    .from("episodes")
    .select("id, title, starts_at, time_zone, status")
    .gte("starts_at", cutoff)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  const episodes = must(episodesRes);

  if (episodes.length === 0) {
    return (
      <div>
        <span className="hm-eyebrow">Itinerary</span>
        <h1 className="hm-h1">Legs and stops.</h1>
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Map"
            title="No itinerary yet."
            detail="An itinerary belongs to an episode. Put one on the board from the Episodes tab and its legs show here."
          />
        </div>
      </div>
    );
  }

  const episode = episodes.find((v) => v.id === sp.episode) ?? episodes[0];

  const [legsRes, stopsRes] = await Promise.all([
    db
      .from("episode_legs")
      .select("id, day, place, note, starts_at, status, hold_reason, hold_new_plan, hold_unchanged")
      .eq("episode_id", episode.id)
      .order("day"),
    db
      .from("episode_stops")
      .select("id, leg_id, position, name, tender_at, last_return, notes")
      .eq("episode_id", episode.id)
      .order("position"),
  ]);

  const legRecords = must(legsRes as { data: LegRecord[] | null; error: null });
  const stopRecords = must(stopsRes as { data: StopRecord[] | null; error: null });

  const stopsPerLeg = new Map<string, number>();
  for (const s of stopRecords) {
    if (!s.leg_id) continue;
    stopsPerLeg.set(s.leg_id, (stopsPerLeg.get(s.leg_id) ?? 0) + 1);
  }

  const legs: LegRow[] = legRecords.map((l) => ({
    id: l.id,
    day: l.day,
    place: l.place,
    note: l.note,
    when: l.starts_at ? `${logDate(l.starts_at, episode.time_zone)} ${logTime(l.starts_at, episode.time_zone)}` : null,
    whenLocal: wallClockField(l.starts_at, episode.time_zone),
    status: l.status,
    holdReason: l.hold_reason,
    holdNewPlan: l.hold_new_plan,
    holdUnchanged: l.hold_unchanged,
    stops: stopsPerLeg.get(l.id) ?? 0,
  }));

  const stops: StopRow[] = stopRecords.map((s) => ({
    id: s.id,
    position: s.position,
    name: s.name,
    legId: s.leg_id,
    tenderAt: clock(s.tender_at),
    lastReturn: clock(s.last_return),
    notes: s.notes,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Itinerary</span>
      <h1 className="hm-h1">Legs and stops.</h1>
      <p className="hm-lede">
        The episode itinerary and the port guide card, as rows. A leg can be
        revised and a revision is timestamped; a hold swaps a leg rather than
        cancelling it, and states the reason, the new plan, and what is
        unchanged.
      </p>

      <div className="hm-sec">
        <EpisodePicker
          options={episodes.map((v) => ({
            value: v.id,
            label: `${logDate(v.starts_at, v.time_zone)} · ${logTime(v.starts_at, v.time_zone)} — ${v.title}`,
          }))}
          value={episode.id}
        />
      </div>

      <ItineraryClient episodeId={episode.id} legs={legs} stops={stops} />
    </div>
  );
}
