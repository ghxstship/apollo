"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { wallClockInZone } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* Legs and stops — the episode itinerary and the port guide.

   Both tables are read by the episode page and neither had a writer anywhere
   in src/. episode_legs was empty, so the itinerary block on an episode never
   rendered at all; episode_stops was empty, so the port guide card was silently
   omitted from every episode page there has ever been. post_a_leg_hold and
   lift_a_leg_hold — the two functions that carry the one episode state with no
   counterpart elsewhere in the schema — had zero callers.

   The hold is not a status field on this screen. A hold states the reason, the
   new plan, and what is unchanged, and the table's own check constraint
   refuses one that does not; post_a_leg_hold says WHICH of the three is
   missing, which is why the hold goes through the function and the plain edit
   does not. */

function done(): ActionResult {
  revalidatePath("/bridge/itinerary");
  /* Both surfaces that render legs: the member's own page, which is still at
     /itinerary, and the public listing, which moved from /charters to
     /episodes. */
  revalidatePath("/itinerary");
  revalidatePath("/episodes");
  return {};
}

/* The episode's own clock, read from the episode. A leg time typed on the
   Bridge and resolved in the node server's zone is the bug createEpisode
   documents at length: on a UTC host, a Chicago tender at 09:00 is published
   as 04:00 CDT. The zone is never taken from the browser. */
async function episodeZone(
  db: ReturnType<typeof moduleTables>,
  episodeId: string
): Promise<string | null> {
  const { data } = await db.from("episodes").select("time_zone").eq("id", episodeId).maybeSingle();
  return (data as { time_zone?: string } | null)?.time_zone ?? null;
}

function instantIn(local: string, zone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const when = new Date(
    wallClockInZone(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), zone)
  );
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/* A leg's day and a stop's position are integer columns with no ceiling of
   their own; a clock is a plain time column. Bounded here so a slipped key
   meets words rather than the driver's. */
const DAY_MAX = 366;
const POSITION_MAX = 999;
const TEXT_MAX = 200;
const NOTE_MAX = 2000;
const isClock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/* An id off a stale row reaches the driver as a malformed uuid, and voice()
   answers that with "that link looks wrong" — true, but it points a member at
   a link when the operator is looking at a row. Caught here and said as a row. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_EPISODE = "That episode is not on the chart.";
const NO_LEG = "That leg is no longer on the itinerary — reload the page.";
const NO_STOP = "That stop is no longer in the port guide — reload the page.";

export type LegInput = {
  day: number;
  place: string;
  note: string;
  /** Wall clock from <input type="datetime-local">, or "" for a leg with no
      stated time. */
  startsAt: string;
};

export async function saveLeg(
  episodeId: string,
  legId: string | null,
  input: LegInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (legId && !UUID.test(legId)) return { error: NO_LEG };

  const place = input.place.trim().slice(0, TEXT_MAX);
  if (!place) return { error: "A leg needs a place." };
  const day = Math.round(Number(input.day) || 0);
  if (day < 1 || day > DAY_MAX) return { error: `A leg's day runs 1 to ${DAY_MAX}.` };

  /* Read the episode whether or not a time was typed: an episode struck since
     the page loaded would otherwise refuse as a foreign key, which voice()
     can only flatten to "didn't land". */
  const zone = await episodeZone(db, episodeId);
  if (!zone) return { error: NO_EPISODE };

  let startsAt: string | null = null;
  if (input.startsAt) {
    startsAt = instantIn(input.startsAt, zone);
    if (!startsAt) return { error: "That time doesn't parse." };
  }

  const patch = { place, note: input.note.trim().slice(0, NOTE_MAX) || null, starts_at: startsAt };

  if (legId) {
    const { data, error } = await db.from("episode_legs").update({ ...patch, day }).eq("id", legId).select("id");
    if (error) {
      if (/voyage_legs_voyage_id_day_key|duplicate/i.test(error.message ?? "")) {
        return { error: `Day ${day} is already a leg on this episode.` };
      }
      return { error: voice(error) };
    }
    if (!data?.length) return { error: NO_LEG };
    return done();
  }

  const { error } = await db.from("episode_legs").insert({ episode_id: episodeId, day, ...patch });
  if (error) {
    if (/voyage_legs_voyage_id_day_key|duplicate/i.test(error.message ?? "")) {
      return { error: `Day ${day} is already a leg on this episode.` };
    }
    return { error: voice(error) };
  }
  return done();
}

/* A leg carries its stops by a composite foreign key with ON DELETE CASCADE,
   so removing a leg removes the port guide entries filed under it. Said at the
   surface before the click, not discovered after. */
export async function removeLeg(legId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(legId)) return { error: NO_LEG };
  const { data, error } = await moduleTables(supabase).from("episode_legs").delete().eq("id", legId).select("id");
  if (error) return { error: voice(error) };
  if (!data?.length) return { error: NO_LEG };
  return done();
}

export async function postLegHold(
  legId: string,
  reason: string,
  newPlan: string,
  unchanged: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(legId)) return { error: NO_LEG };

  /* The function refuses a hold missing any of the three, but says "all
     three" without naming the one left blank. Named here, one at a time, for
     the person who has to write it. The columns carry no ceiling; NOTE_MAX is
     the same bound the leg note takes. */
  const lines = [
    [reason.trim(), "the reason"],
    [newPlan.trim(), "the new plan"],
    [unchanged.trim(), "what is unchanged"],
  ] as const;
  for (const [line, what] of lines) {
    if (!line) return { error: `A hold states ${what} — that line is blank.` };
    if (line.length > NOTE_MAX) return { error: `A hold's lines run to ${NOTE_MAX} characters each — ${what} is longer.` };
  }

  const { error } = await moduleTables(supabase).rpc("post_a_leg_hold", {
    p_leg: legId,
    p_reason: lines[0][0],
    p_new_plan: lines[1][0],
    p_unchanged: lines[2][0],
  });
  if (error) return { error: voice(error) };
  return done();
}

/* Lifting names what the leg became. `revised` says the plan changed and the
   member is owed the new one; the alternative puts it back to planned, which
   is only honest when the hold turned out to be nothing. */
export async function liftLegHold(legId: string, revised: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(legId)) return { error: NO_LEG };

  const { error } = await moduleTables(supabase).rpc("lift_a_leg_hold", {
    p_leg: legId,
    p_revised: revised,
  });
  if (error) return { error: voice(error) };
  return done();
}

export type StopInput = {
  position: number;
  name: string;
  legId: string | null;
  /** "HH:MM" or "" — the columns are plain times, read on the port's clock. */
  tenderAt: string;
  lastReturn: string;
  notes: string;
};

export async function saveStop(
  episodeId: string,
  stopId: string | null,
  input: StopInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (stopId && !UUID.test(stopId)) return { error: NO_STOP };
  if (input.legId && !UUID.test(input.legId)) return { error: "Pick the leg off the list." };

  const name = input.name.trim().slice(0, TEXT_MAX);
  if (!name) return { error: "A stop needs a name." };
  const position = Math.round(Number(input.position) || 0);
  if (position < 1 || position > POSITION_MAX) return { error: `A stop's position runs 1 to ${POSITION_MAX}.` };
  if (input.tenderAt && !isClock(input.tenderAt)) return { error: "That tender time doesn't parse." };
  if (input.lastReturn && !isClock(input.lastReturn)) return { error: "That last-return time doesn't parse." };

  /* Tender out before last return, or the card tells a guest to be back before
     they land. The database does not hold this one, so the screen does. */
  if (input.tenderAt && input.lastReturn && input.lastReturn <= input.tenderAt) {
    return { error: "The last tender back has to be after the tender out." };
  }

  /* The zone is not wanted here; the read is the same one, and it is the
     difference between "that episode is not on the chart" and a foreign key
     refusal flattened to "didn't land". */
  if (!(await episodeZone(db, episodeId))) return { error: NO_EPISODE };

  /* A stop files under a leg by a composite key on (episode, leg), so a leg
     from another episode — or one removed since the page loaded — is refused
     as a foreign key. Read first and say which. */
  if (input.legId) {
    const { data: leg } = await db
      .from("episode_legs")
      .select("id")
      .eq("id", input.legId)
      .eq("episode_id", episodeId)
      .maybeSingle();
    if (!leg) return { error: "That leg is not on this episode's itinerary — pick another, or leave it blank." };
  }

  const patch = {
    position,
    name,
    leg_id: input.legId || null,
    tender_at: input.tenderAt || null,
    last_return: input.lastReturn || null,
    notes: input.notes.trim().slice(0, NOTE_MAX) || null,
  };

  const res = stopId
    ? await db.from("episode_stops").update(patch).eq("id", stopId).select("id")
    : await db.from("episode_stops").insert({ episode_id: episodeId, ...patch }).select("id");
  if (res.error) {
    if (/voyage_stops_voyage_id_position_key|duplicate/i.test(res.error.message ?? "")) {
      return { error: `Position ${position} is already taken in this port guide.` };
    }
    return { error: voice(res.error) };
  }
  if (stopId && !res.data?.length) return { error: NO_STOP };
  return done();
}

export async function removeStop(stopId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(stopId)) return { error: NO_STOP };
  const { data, error } = await moduleTables(supabase).from("episode_stops").delete().eq("id", stopId).select("id");
  if (error) return { error: voice(error) };
  if (!data?.length) return { error: NO_STOP };
  return done();
}
