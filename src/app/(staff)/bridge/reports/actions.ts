"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type OutboxTable = "email_outbox" | "sms_outbox" | "push_outbox";

const OUTBOXES: OutboxTable[] = ["email_outbox", "sms_outbox", "push_outbox"];

/* A dead outbox row can be put back in the water. requeue_outbox_row is
   staff-checked inside, accepts only the three outboxes, and moves only a
   failed or skipped row back to pending — a sent letter cannot be resent from
   here, and a pending one is already in the queue. */
export async function requeueOutbox(table: OutboxTable, id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!OUTBOXES.includes(table)) return { error: "That is not an outbox." };

  const { error } = await supabase.rpc("requeue_outbox_row", { p_table: table, p_id: id });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    return { error: ERR_LAND };
  }
  revalidatePath("/bridge/reports");
  return {};
}
