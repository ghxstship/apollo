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

export type ShowResult = { error?: string; ok?: true; minted?: number };

async function crew() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  /* RLS is the authority; this is the backstop, so a single policy regression
     cannot become a member driving the show from their own page. */
  if (user) {
    const { data: staff } = await supabase.rpc("is_staff");
    if (!staff) return { supabase, db: moduleTables(supabase), user: null };
  }
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

/* Putting a guest in the queue at all. Until this existed the Pod could be
   advanced but never populated: every control moved an existing row, no code
   path inserted one, and the queue was empty on every episode there has ever
   been.

   The insert is deliberately minimal — voyage, pass, position. `state` defaults
   to 'waiting', which is the queue's entry state; `vip_priority` defaults
   false; and `blur_required` is not sent at all, because the
   a_pod_session_keeps_its_blur trigger derives it from blur_is_required() on
   the guest's own record, and a client that supplied the value would only be
   supplying something for the trigger to overrule. Authority is the
   "the queue is the crew's" ALL policy (is_staff), same as every other write
   on this surface. */
export async function enqueuePod(voyageId: string, rsvpId: string): Promise<ShowResult> {
  const { supabase, db, user } = await crew();
  if (!user) return { error: "Sign in first." };
  if (!rsvpId) return { error: "Pick a guest first." };

  /* Next position. The ceiling aboard is forty souls, so one small read is
     fine; the unique (voyage_id, position) index catches the race below. */
  const { data: tail, error: readError } = await db
    .from("pod_sessions")
    .select("position")
    .eq("voyage_id", voyageId)
    .order("position", { ascending: false })
    .limit(1);
  if (readError) return { error: await voiceWith(supabase, readError) };
  const position = ((tail?.[0]?.position as number | undefined) ?? 0) + 1;

  const { error } = await db
    .from("pod_sessions")
    .insert({ voyage_id: voyageId, rsvp_id: rsvpId, position });
  if (error) {
    if (error.code === "23505") {
      /* Two unique indexes can refuse this. (voyage_id, rsvp_id) means the
         guest is already queued; (voyage_id, position) means two tablets hit
         the queue in the same moment. */
      return /position/i.test(error.message ?? "")
        ? { error: "Two crew reached for the queue at once. Press it again." }
        : { error: "That guest is already in the queue." };
    }
    return { error: await voiceWith(supabase, error) };
  }
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

  /* The RPC returns how many it actually minted. That number used to be thrown
     away, and the screen then announced a figure it had computed from props
     captured before the click — so a second operator pressing the button was
     told "3 envelopes minted" when nothing was. Same shape as the "$150 credit
     applied" defect: a number asserted rather than read. */
  const { data: minted, error } = await db.rpc("issue_the_envelopes", { p_voyage: voyageId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/show");
  /* The Bridge's Envelopes screen is the surface that can actually READ the
     tokens back and put them on paper — this returns only a count, and for a
     while a count was the whole product: the crew pressed a button, got a
     number, and had no way to obtain the thing they were supposed to print. */
  revalidatePath("/bridge/envelopes");
  return { ok: true, minted: typeof minted === "number" ? minted : undefined };
}
