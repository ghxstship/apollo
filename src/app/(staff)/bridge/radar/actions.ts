"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* The radar clock, from the Bridge.

   `open_the_radar` has existed since the module landed and had no caller
   anywhere — not in src/, not from a trigger, not from a function. It is the
   only writer of voyage_radar, so voyage_radar had no rows, so /radar answered
   "Dark" to every member on every sailing, radar_sweep and hold_the_radar_lock
   both refused with "radar does not run on this sailing", radar_picks and
   shared_anchors could never be written, and settle_the_match_guarantee
   returned early on a null clock — which put the $150 Match Guarantee out of
   reach of the product entirely.

   Everything the clock contains is derived by the function from the sailing's
   own date and zone. There is no time field on this screen for the same reason
   there is no cap field on hold_the_radar_lock: 17:15 and 17:30 are the
   product, not a setting, and a Bridge that could type a different lock would
   be a Bridge that could disagree with the copy every member has already read. */

function done(): ActionResult {
  revalidatePath("/bridge/radar");
  revalidatePath("/radar");
  return {};
}

export async function openTheRadar(voyageId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  /* Through the RPC, never by writing voyage_radar directly. The four
     timestamps have to be read off the SAILING'S zone — a clock built from the
     operator's browser would lock a Los Angeles sailing at 17:30 Eastern — and
     the function is the one place that arithmetic is written down. */
  const { error } = await moduleTables(supabase).rpc("open_the_radar", { p_voyage: voyageId });
  if (error) return { error: voice(error) };
  return done();
}
