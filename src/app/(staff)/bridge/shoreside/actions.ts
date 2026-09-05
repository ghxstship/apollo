"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* Posting to a thread is gated on membership of it, and an operator answering
   the shore is not a member of the thread until they answer. So we seat them
   first, then speak — the roster is the record of who replied. */
/* The thread id is a row id off the list. A malformed one reaches the driver as
   "invalid input syntax for type uuid", which names a Postgres type at an
   operator who never chose one; refused here first. */
const UUID = /^[0-9a-f-]{36}$/;

export async function replyToThread(threadId: string, body: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(threadId)) return { error: ERR_LAND };

  const line = body.trim();
  if (!line) return { error: "Nothing to send." };
  /* The same ceiling the member's own composer keeps. */
  if (line.length > 4000) return { error: "Keep it under 4,000 characters." };

  const { error: seatError } = await supabase
    .from("thread_members")
    .upsert(
      { thread_id: threadId, profile_id: staffId, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,profile_id" }
    );
  if (seatError) {
    /* The seat is keyed on the thread; a thread struck from the board since
       the list loaded has no seat to take. */
    if (seatError.code === "23503") return { error: "That thread is no longer on the board." };
    return { error: ERR_LAND };
  }

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, author_id: staffId, body: line });
  if (error) {
    if (error.code === "23503") return { error: "That thread is no longer on the board." };
    return { error: ERR_LAND };
  }

  revalidatePath("/bridge/shoreside");
  return {};
}
