"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";
import { asText, isId } from "@/lib/arg";

function done(): ActionResult {
  revalidatePath("/bridge/moderation");
  revalidatePath("/open-deck");
  return {};
}

/* The flag id comes off the queue. A malformed one reaches the driver as
   "invalid input syntax for type uuid", which names a Postgres type at an
   operator who never chose one; refused here first — by isId, which is the
   canonical shape, where the local pattern this replaced also admitted
   thirty-six dashes. */
const REASON_MAX = 500;

/* Remove the post and tell the author why — never silently. The flag is
   marked first so the record survives the post's cascade.

   The post and the author are read off the flag, not off the wire. They used
   to be parameters, carried down from the queue screen and never checked
   against the flag they arrived with — so a stale tab or a replayed call
   resolved one flag while deleting an unrelated post and telling an unrelated
   member their words came down. Nothing escalated (this is staff-only at both
   layers), but the moderation record then said something that did not happen,
   which is the one thing an audit trail may never do. The database already
   relates the three: flag → post → author. Ask it. */
export async function removeAndNotify(flagId: string, reason: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!isId(flagId)) return { error: ERR_LAND };
  /* The line is the body of the word the author reads. Bounded so a pasted
     essay does not become a notification — and refused, rather than cut, so
     the author reads the sentence the operator meant to send and not the
     first half of it. */
  if (asText(reason).trim().length > REASON_MAX) return { error: `The reason runs to ${REASON_MAX} characters.` };
  const line = asText(reason).trim() || "Against the code of conduct.";

  /* One read decides what this action touches. A flag that is no longer there
     is a stale tab, and saying so is more use than a generic failure. */
  const { data: flag, error: readError } = await supabase
    .from("open_deck_flags")
    .select("post_id")
    .eq("id", flagId)
    .maybeSingle();
  if (readError) return { error: ERR_LAND };
  if (!flag) return { error: "That flag is no longer in the queue." };
  const postId: string | null = flag.post_id;

  /* The author is the post's author — there is no author column on a flag, and
     there should not be one: two records of the same fact drift. */
  let authorId: string | null = null;
  if (postId) {
    const { data: post, error: postError } = await supabase
      .from("open_deck_posts")
      .select("author_id")
      .eq("id", postId)
      .maybeSingle();
    if (postError) return { error: ERR_LAND };
    authorId = post?.author_id ?? null;
  }

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
  if (!isId(flagId)) return { error: ERR_LAND };
  const { error } = await supabase
    .from("open_deck_flags")
    .update({ status: "left_up", resolved_by: staffId })
    .eq("id", flagId);
  if (error) return { error: ERR_LAND };
  return done();
}
