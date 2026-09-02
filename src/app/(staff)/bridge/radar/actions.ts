"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* The radar clock, from the Bridge.

   `open_the_radar` has existed since the module landed and had no caller
   anywhere — not in src/, not from a trigger, not from a function. It is the
   only writer of episode_radar, so episode_radar had no rows, so /radar answered
   "Dark" to every member on every episode, radar_sweep and hold_the_radar_lock
   both refused with "radar does not run on this sailing", radar_picks and
   shared_anchors could never be written, and settle_the_match_guarantee
   returned early on a null clock — which put the $150 Match Guarantee out of
   reach of the product entirely.

   Everything the clock contains is derived by the function from the episode's
   own date and zone. There is no time field on this screen for the same reason
   there is no cap field on hold_the_radar_lock: 17:15 and 17:30 are the
   product, not a setting, and a Bridge that could type a different lock would
   be a Bridge that could disagree with the copy every member has already read. */

function done(): ActionResult {
  revalidatePath("/bridge/radar");
  revalidatePath("/radar");
  return {};
}

export async function openTheRadar(episodeId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  /* Through the RPC, never by writing episode_radar directly. The four
     timestamps have to be read off the EPISODE'S zone — a clock built from the
     operator's browser would lock a Los Angeles episode at 17:30 Eastern — and
     the function is the one place that arithmetic is written down. */
  const { error } = await moduleTables(supabase).rpc("open_the_radar", { p_episode: episodeId });
  if (error) return { error: voice(error) };
  return done();
}

export type CutResult = { error?: string; cut?: number };

/* The incident control: cut every live anchor on one episode short, now.

   The authority is the "staff may cut an anchor short" UPDATE policy plus the
   table grant that 20260825073049 restored behind it, and the DIRECTION is the
   an_anchor_is_never_extended trigger — expires_at may only ever come forward,
   so this write can end a contact and can never quietly re-open one.

   It is a per-episode cut, not a per-anchor one, and that is deliberate. Staff
   can count anchors (the select policy admits is_staff), but a per-anchor
   control would have to render the pair — who anchored with whom — on a crew
   screen, and this page's own copy says a member's contacts are not crew
   reading material. So the control stays blind: one episode, every live
   anchor, all at once.

   The `.gt("expires_at", now)` filter is load-bearing twice over: it keeps the
   write to anchors that are still alive, and it keeps already-expired rows out
   from under the never-extend trigger — setting an expired row to now() would
   count as an extension and abort the whole statement. */
export async function cutAnchorsShort(episodeId: string): Promise<CutResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const now = new Date().toISOString();
  const { data, error } = await moduleTables(supabase)
    .from("shared_anchors")
    .update({ expires_at: now })
    .eq("episode_id", episodeId)
    .gt("expires_at", now)
    .select("id");
  if (error) return { error: voice(error) };

  revalidatePath("/bridge/radar");
  revalidatePath("/radar");
  return { cut: (data ?? []).length };
}
