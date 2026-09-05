"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/moderation");
  revalidatePath("/open-deck");
  return {};
}

/* Flag, post and author ids all come off the queue. A malformed one reaches
   the driver as "invalid input syntax for type uuid", which names a Postgres
   type at an operator who never chose one; refused here first. */
const UUID = /^[0-9a-f-]{36}$/;
const REASON_MAX = 500;

/* Remove the post and tell the author why — never silently. The flag is
   marked first so the record survives the post's cascade. */
export async function removeAndNotify(
  flagId: string,
  postId: string | null,
  authorId: string | null,
  reason: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(flagId)) return { error: ERR_LAND };
  if (postId !== null && !UUID.test(postId)) return { error: ERR_LAND };
  if (authorId !== null && !UUID.test(authorId)) return { error: ERR_LAND };
  /* The line is the body of the word the author reads. Bounded so a pasted
     essay does not become a notification — and refused, rather than cut, so
     the author reads the sentence the operator meant to send and not the
     first half of it. */
  if (reason.trim().length > REASON_MAX) return { error: `The reason runs to ${REASON_MAX} characters.` };
  const line = reason.trim() || "Against the code of conduct.";

  const { error: flagError } = await supabase
    .from("open_deck_flags")
    .update({ status: "removed", resolved_by: staffId })
    .eq("id", flagId);
  if (flagError) return { error: ERR_LAND };

  /* notifications is definer-write only, so the word goes through the Bridge's
     RPC — and its failure is surfaced, not swallowed. Telling the author is the
     point of this action; if it cannot be done, the post stays up. The one
     exception is an author who has left the club: there is nobody to tell,
     and their post is not thereby immune. */
  if (authorId) {
    const { error: wordError } = await supabase.rpc("notify_member", {
      p_profile: authorId,
      p_kind: "word",
      p_title: "Removed from the Open Deck",
      p_body: line,
    });
    if (wordError && !/no such member/i.test(wordError.message)) {
      return { error: "The author could not be told, so the post stands." };
    }
  }

  /* The post may already be gone — the author can strike their own. Resolving
     the flag is still the point. */
  if (postId) {
    /* Every other open flag on the same post is answered by the same removal.
       Left open, each one came back to the queue as a card reading "The post
       is already gone", to be resolved one at a time for a decision the
       Bridge had already made. The cascade nulls post_id, so they are marked
       before the delete, while they can still be found by it. */
    await supabase
      .from("open_deck_flags")
      .update({ status: "removed", resolved_by: staffId })
      .eq("post_id", postId)
      .eq("status", "open");
    const { error: deleteError } = await supabase.from("open_deck_posts").delete().eq("id", postId);
    if (deleteError) return { error: ERR_LAND };
  }

  return done();
}

/* Leave it up — logged, resolved, eyes stay on the thread. */
export async function leaveUp(flagId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(flagId)) return { error: ERR_LAND };
  const { error } = await supabase
    .from("open_deck_flags")
    .update({ status: "left_up", resolved_by: staffId })
    .eq("id", flagId);
  if (error) return { error: ERR_LAND };
  return done();
}
