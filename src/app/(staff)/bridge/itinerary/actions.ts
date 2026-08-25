"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { wallClockInZone } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* Legs and stops — the charter itinerary and the port guide.

   Both tables are read by /charter and neither had a writer anywhere in src/.
   voyage_legs was empty, so the itinerary block on a charter never rendered at
   all; voyage_stops was empty, so the port guide card was silently omitted
   from every charter page there has ever been. post_a_leg_hold and
   lift_a_leg_hold — the two functions that carry the one charter state with no
   counterpart elsewhere in the schema — had zero callers.

   The hold is not a status field on this screen. A hold states the reason, the
   new plan, and what is unchanged, and the table's own check constraint
   refuses one that does not; post_a_leg_hold says WHICH of the three is
   missing, which is why the hold goes through the function and the plain edit
   does not. */

function done(): ActionResult {
  revalidatePath("/bridge/itinerary");
  revalidatePath("/charter");
  revalidatePath("/charters");
  return {};
}

/* The sailing's own clock, read from the sailing. A leg time typed on the
   Bridge and resolved in the node server's zone is the bug createVoyage
   documents at length: on a UTC host, a Chicago tender at 09:00 is published
   as 04:00 CDT. The zone is never taken from the browser. */
async function voyageZone(
  db: ReturnType<typeof moduleTables>,
  voyageId: string
): Promise<string | null> {
  const { data } = await db.from("voyages").select("time_zone").eq("id", voyageId).maybeSingle();
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

export type LegInput = {
  day: number;
  port: string;
  note: string;
  /** Wall clock from <input type="datetime-local">, or "" for a leg with no
      stated time. */
  startsAt: string;
};

export async function saveLeg(
  voyageId: string,
  legId: string | null,
  input: LegInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const port = input.port.trim();
  if (!port) return { error: "A leg needs a port." };
  const day = Math.max(1, Math.round(Number(input.day) || 0));

  let startsAt: string | null = null;
  if (input.startsAt) {
    const zone = await voyageZone(db, voyageId);
    if (!zone) return { error: "That sailing is not on the chart." };
    startsAt = instantIn(input.startsAt, zone);
    if (!startsAt) return { error: "That time doesn't parse." };
  }

  const patch = { port, note: input.note.trim() || null, starts_at: startsAt };

  if (legId) {
    const { error } = await db.from("voyage_legs").update({ ...patch, day }).eq("id", legId);
    if (error) {
      if (/voyage_legs_voyage_id_day_key|duplicate/i.test(error.message ?? "")) {
        return { error: `Day ${day} is already a leg on this sailing.` };
      }
      return { error: voice(error) };
    }
    return done();
  }

  const { error } = await db.from("voyage_legs").insert({ voyage_id: voyageId, day, ...patch });
  if (error) {
    if (/voyage_legs_voyage_id_day_key|duplicate/i.test(error.message ?? "")) {
      return { error: `Day ${day} is already a leg on this sailing.` };
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
  const { error } = await moduleTables(supabase).from("voyage_legs").delete().eq("id", legId);
  if (error) return { error: voice(error) };
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

  const { error } = await moduleTables(supabase).rpc("post_a_leg_hold", {
    p_leg: legId,
    p_reason: reason.trim(),
    p_new_plan: newPlan.trim(),
    p_unchanged: unchanged.trim(),
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
  voyageId: string,
  stopId: string | null,
  input: StopInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const name = input.name.trim();
  if (!name) return { error: "A stop needs a name." };
  const position = Math.max(1, Math.round(Number(input.position) || 0));

  /* Tender out before last return, or the card tells a guest to be back before
     they land. The database does not hold this one, so the screen does. */
  if (input.tenderAt && input.lastReturn && input.lastReturn <= input.tenderAt) {
    return { error: "The last tender back has to be after the tender out." };
  }

  const patch = {
    position,
    name,
    leg_id: input.legId || null,
    tender_at: input.tenderAt || null,
    last_return: input.lastReturn || null,
    notes: input.notes.trim() || null,
  };

  const res = stopId
    ? await db.from("voyage_stops").update(patch).eq("id", stopId)
    : await db.from("voyage_stops").insert({ voyage_id: voyageId, ...patch });
  if (res.error) {
    if (/voyage_stops_voyage_id_position_key|duplicate/i.test(res.error.message ?? "")) {
      return { error: `Position ${position} is already taken in this port guide.` };
    }
    return { error: voice(res.error) };
  }
  return done();
}

export async function removeStop(stopId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await moduleTables(supabase).from("voyage_stops").delete().eq("id", stopId);
  if (error) return { error: voice(error) };
  return done();
}
