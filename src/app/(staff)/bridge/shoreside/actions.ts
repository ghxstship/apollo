"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* Posting to a thread is gated on membership of it, and an operator answering
   the shore is not a member of the thread until they answer. So we seat them
   first, then speak — the roster is the record of who replied. */
export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const line = body.trim();
  if (!line) return { error: "Nothing to send." };

  const { error: seatError } = await supabase
    .from("thread_members")
    .upsert(
      { thread_id: threadId, profile_id: staffId, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,profile_id" }
    );
  if (seatError) return { error: ERR_LAND };

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, author_id: staffId, body: line });
  if (error) return { error: ERR_LAND };

  revalidatePath("/bridge/shoreside");
  return {};
}
