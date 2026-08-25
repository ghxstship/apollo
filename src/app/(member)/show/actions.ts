"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { voiceWith } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import { DECK_STATES, POD_MAX_SECONDS, POD_STATES, type DeckState, type PodState } from "@/lib/show";

/* Show — the crew's writes. Every one of these is refused for a non-staff caller
   by RLS on the table it touches (`is_staff()` on run_of_show, pod_sessions, and
   the staff-write policy on voyages), so the checks here are for the message and
   not for the authority.

   One thing is deliberately absent: there is no action that sets blur_required.
   "BLUR REQUESTED IS SET FROM THE PREFERENCE SHEET AND CANNOT BE OVERRIDDEN ON
   DECK" is a statement about write authority, so the ratchet lives in
   a_pod_session_keeps_its_blur and there is no crew-side call that could lower
   it. A guest can raise it by telling the crew — advancePod carries a raise-only
   flag — and nothing lowers it. */

export type ShowResult = { error?: string; ok?: true };

async function crew() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, db: moduleTables(supabase), user };
}

/* One flag flies at a time, which is a single-valued column rather than a table
   of hoisted flags — so "raise this one" is an update and lowering the previous
   one is not a separate act that can be forgotten. */
export async function setDeckState(voyageId: string, state: string | null): Promise<ShowResult> {
  const { supabase, db, user } = await crew();
  if (!user) return { error: "Sign in first." };
  if (state !== null && !(DECK_STATES as readonly string[]).includes(state)) {
    return { error: "That is not one of the four flags." };
  }

  const { error } = await db
    .from("voyages")
    .update({ deck_state: state as DeckState | null })
    .eq("id", voyageId);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/show");
  return { ok: true };
}

/* The eight canonical windows from operations.md, through the RPC so the board
   is the run of show rather than eight rows somebody retypes at 06:00 with one
   BPM wrong. */
export async function seedTheBoard(voyageId: string): Promise<ShowResult> {
  const { supabase, db, user } = await crew();
  if (!user) return { error: "Sign in first." };

  const { error } = await db.rpc("seed_the_run_of_show", { p_voyage: voyageId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/show");
  return { ok: true };
}

/* Moving a guest through the pod. `blur` is raise-only by name as well as by
   trigger: there is no false to send, because the parameter is a boolean that is
   OR'd in rather than assigned, and the trigger would ignore a false anyway.
   Ninety seconds is a check constraint, so a longer recording is refused by the
   database and not by whichever tablet happens to be running the queue. */
export async function advancePod(
  sessionId: string,
  state: string,
  opts: { blur?: true; durationSeconds?: number } = {}
): Promise<ShowResult> {
  const { supabase, db, user } = await crew();
  if (!user) return { error: "Sign in first." };
  if (!(POD_STATES as readonly string[]).includes(state)) {
    return { error: "That is not a pod state." };
  }
  if (opts.durationSeconds !== undefined && opts.durationSeconds > POD_MAX_SECONDS) {
    return { error: `Ninety seconds is the ceiling — that one ran ${opts.durationSeconds}.` };
  }

  const patch: Record<string, unknown> = { state: state as PodState };
  if (state === "recording") patch.started_at = new Date().toISOString();
  if (state === "done" || state === "skipped") patch.ended_at = new Date().toISOString();
  if (opts.blur) patch.blur_required = true;
  if (opts.durationSeconds !== undefined) patch.duration_s = opts.durationSeconds;

  const { error } = await db.from("pod_sessions").update(patch).eq("id", sessionId);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/show");
  return { ok: true };
}

/* Forty gold-foil envelopes, printed at once. An unissued one is a guest at the
   dock with nothing in their hand and no way into their own anchors at 19:00. */
export async function issueTheEnvelopes(voyageId: string): Promise<ShowResult> {
  const { supabase, db, user } = await crew();
  if (!user) return { error: "Sign in first." };

  const { error } = await db.rpc("issue_the_envelopes", { p_voyage: voyageId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/show");
  return { ok: true };
}
