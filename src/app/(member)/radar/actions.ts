"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REFUSED_MESSAGE, voiceWith } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";

/* Radar — Plot Course, the lock, and the envelope.

   There is no `pass` action in this file, and there will not be one. "A PASS IS
   NEVER RECORDED, NEVER SHOWN, NEVER COUNTED": the database has no column to
   record one in, so declining a pin is the absence of a call rather than a call.

   Everything about timing is refused by hold_the_radar_lock, not by this file
   and not by a disabled button. That matters because /rest/v1/radar_picks is
   reachable with curl by any signed-in member — a React state guard is a
   courtesy to the honest and nothing at all to anyone else. What these functions
   do is carry the trigger's own sentence back. */

export type RadarResult = { error?: string; ok?: true; opened?: number };

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, db: moduleTables(supabase), user };
}

export async function plotCourse(
  voyageId: string,
  pickerRsvp: string,
  pickedRsvp: string
): Promise<RadarResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };
  if (pickerRsvp === pickedRsvp) return { error: "Not yourself." };

  const { error } = await db
    .from("radar_picks")
    .insert({ voyage_id: voyageId, picker_rsvp: pickerRsvp, picked_rsvp: pickedRsvp });
  if (error) {
    /* Plotting the same pin twice is not a failure — the slot is already filled
       with exactly what the member asked for, and an error here would report a
       problem that does not exist. */
    if (/duplicate|already exists/i.test(error.message ?? "")) return { ok: true };
    const said = await voiceWith(supabase, error);
    return {
      error: said === REFUSED_MESSAGE ? "Plot course from your own pass, aboard." : said,
    };
  }
  revalidatePath("/radar");
  return { ok: true };
}

/* Changing a filled slot. The DELETE exists so "CHANGE" works before 17:30, and
   the same trigger refuses it after — which is the half of "no edits after the
   lock" that is easy to leave out. Without it, a member about to be revealed as
   a mutual anchor at 19:00 could quietly unplot at 18:59 and the other side's
   anchor would evaporate with no trace and no explanation. */
export async function unplotCourse(
  voyageId: string,
  pickerRsvp: string,
  pickedRsvp: string
): Promise<RadarResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  const { error } = await db
    .from("radar_picks")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("picker_rsvp", pickerRsvp)
    .eq("picked_rsvp", pickedRsvp);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/radar");
  return { ok: true };
}

/* The sealed Captain's Log. The token is printed inside the envelope and lives
   in a table the member cannot read — so this takes what they scanned or typed,
   and the RPC decides. Before 19:00 it says so; after the twenty-four hours it
   says the contacts are gone on both sides, which is true and is not softened,
   because implying an appeal exists at that moment would be the cruellest
   possible lie. */
export async function openTheLog(token: string): Promise<RadarResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  const trimmed = token.trim();
  /* Checked here so a mistyped code is answered by the form rather than by
     "invalid input syntax for type uuid", which names a Postgres type at a
     member who never chose one. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { error: "That code does not look like the one on the envelope." };
  }

  const { data, error } = await db.rpc("open_the_captains_log", { p_token: trimmed });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/radar");
  return { ok: true, opened: typeof data === "number" ? data : 0 };
}
