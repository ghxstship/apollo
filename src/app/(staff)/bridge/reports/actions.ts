"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type OutboxTable = "email_outbox" | "sms_outbox" | "push_outbox";

const OUTBOXES: OutboxTable[] = ["email_outbox", "sms_outbox", "push_outbox"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A dead outbox row can be put back in the water. requeue_outbox_row is
   staff-checked inside, accepts only the three outboxes, and moves only a
   failed or skipped row back to pending — a sent letter cannot be resent from
   here, and a pending one is already in the queue. */
export async function requeueOutbox(table: OutboxTable, id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!OUTBOXES.includes(table)) return { error: "That is not an outbox." };
  /* A malformed id off a stale report would reach the function as a 22P02 and
     come back as "That didn't land" — which an operator would retry. */
  if (!UUID.test(id)) return { error: "That row is no longer on the report." };

  const { error } = await supabase.rpc("requeue_outbox_row", { p_table: table, p_id: id });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    return { error: voice(error) };
  }
  revalidatePath("/bridge/reports");
  return {};
}

/* A stranded row that should never go — a suppressed address, a fixture
   number, a letter to a member since departed — is struck. The policy admits
   staff and refuses a row in flight; a sent letter is history and is not
   offered here. */
export async function strikeOutbox(table: OutboxTable, id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!OUTBOXES.includes(table)) return { error: "That is not an outbox." };
  if (!UUID.test(id)) return { error: "That row is no longer on the report." };
  const { data, error } = await supabase.from(table).delete().eq("id", id).neq("status", "sent").select("id");
  if (error) return { error: voice(error) };
  if (!data || data.length === 0) return { error: "That row is already gone, or it is in flight — try again in a minute." };
  revalidatePath("/bridge/reports");
  return {};
}
