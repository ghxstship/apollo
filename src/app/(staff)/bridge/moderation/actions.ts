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
  postId: string,
  authorId: string | null,
  reason: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const line = reason.trim() || "Against the code of conduct.";

  const { error: flagError } = await supabase
    .from("wardroom_flags")
    .update({ status: "removed", resolved_by: staffId })
    .eq("id", flagId);
  if (flagError) return { error: ERR_LAND };

  if (authorId) {
    await supabase.from("notifications").insert({
      profile_id: authorId,
      kind: "word",
      title: "Removed from the Open Deck",
      body: line,
    });
  }

  const { error: deleteError } = await supabase.from("wardroom_posts").delete().eq("id", postId);
  if (deleteError) return { error: ERR_LAND };

  return done();
}

/* Leave it up — logged, resolved, eyes stay on the thread. */
export async function leaveUp(flagId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("wardroom_flags")
    .update({ status: "left_up", resolved_by: staffId })
    .eq("id", flagId);
  if (error) return { error: ERR_LAND };
  return done();
}
