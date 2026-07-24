"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* Stamp the gangway — check a berth in with the operator's name on it. */
export async function checkInRsvp(rsvpId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: staffId })
    .eq("id", rsvpId);
  if (error) return { error: ERR_LAND };
  revalidatePath("/harbormaster/manifests");
  return {};
}
