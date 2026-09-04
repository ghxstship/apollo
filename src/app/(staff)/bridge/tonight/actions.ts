"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* — Tables: the Bridge writer Table night never had —

   A table is a number and a count of chairs on one shore night. The policy
   "staff keep tables" (20260821120000) has admitted these writes since the
   product shipped; no screen ever made them. */

function done(): ActionResult {
  revalidatePath("/bridge/tonight");
  revalidatePath("/tonight");
  return {};
}

export async function createTable(
  episodeId: string,
  number: number,
  seats: number
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!episodeId) return { error: "Pick the night first." };

  const n = Math.round(number);
  if (!Number.isFinite(n) || n < 1 || n > 999) return { error: "A table needs a number, one to 999." };

  /* The check constraint says 2–12; this is the readable version of it. */
  const s = Math.round(seats);
  if (!Number.isFinite(s) || s < 2 || s > 12)
    return { error: "A table seats between two and twelve." };

  const { data: night, error: nightError } = await supabase
    .from("episodes")
    .select("id, setting, status")
    .eq("id", episodeId)
    .maybeSingle();
  if (nightError) return { error: ERR_LAND };
  if (!night) return { error: "That night is not on the board." };
  if (night.setting !== "shore") return { error: "Tables are laid ashore only — pick a night ashore." };
  if (night.status !== "scheduled" && night.status !== "live")
    return { error: "That night is off the board. Tables go on a scheduled or live night." };

  const { error } = await supabase
    .from("tables")
    .insert({ episode_id: episodeId, number: n, seats: s });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? `Table ${n} is already laid for that night. Pick another number.`
        : ERR_LAND,
    };
  }
  return done();
}

/* A table with a confirmed seat is somebody's evening. Held seats lapse on
   their own in fifteen minutes; confirmed ones do not, so the table stays
   until they are released from the member side or the pass is struck. */
export async function deleteTable(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { count, error: countError } = await supabase
    .from("table_seats")
    .select("table_id", { count: "exact", head: true })
    .eq("table_id", id)
    .eq("state", "confirmed");
  if (countError) return { error: ERR_LAND };
  if ((count ?? 0) > 0) {
    return {
      error: `${count} ${count === 1 ? "seat is" : "seats are"} confirmed at that table. It stays until they are released — the seat follows the pass.`,
    };
  }

  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}
