"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/moderation");
  revalidatePath("/open-deck");
  return {};
}

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
  /* The line is the body of the word the author reads. Bounded so a pasted
     essay does not become a notification. */
  const line = reason.trim().slice(0, 500) || "Against the code of conduct.";

  const { error: flagError } = await supabase
    .from("open_deck_flags")
    .update({ status: "removed", resolved_by: staffId })
    .eq("id", flagId);
  if (flagError) return { error: ERR_LAND };

  /* notifications is definer-write only, so the word goes through the Bridge's
     RPC — and its failure is surfaced, not swallowed. Telling the author is the
     point of this action; if it cannot be done, the post stays up. */
  if (authorId) {
    const { error: wordError } = await supabase.rpc("notify_member", {
      p_profile: authorId,
      p_kind: "word",
      p_title: "Removed from the Open Deck",
      p_body: line,
    });
    if (wordError) return { error: "The author could not be told, so the post stands." };
  }

  /* The post may already be gone — the author can strike their own. Resolving
     the flag is still the point. */
  if (postId) {
    const { error: deleteError } = await supabase.from("open_deck_posts").delete().eq("id", postId);
    if (deleteError) return { error: ERR_LAND };
  }

  return done();
}

/* Leave it up — logged, resolved, eyes stay on the thread. */
export async function leaveUp(flagId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("open_deck_flags")
    .update({ status: "left_up", resolved_by: staffId })
    .eq("id", flagId);
  if (error) return { error: ERR_LAND };
  return done();
}
