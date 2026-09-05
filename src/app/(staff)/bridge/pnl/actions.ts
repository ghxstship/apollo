"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* What a night cost, recorded by the person who knows.

   No rate in this system is guessed. Vessels, venues and crew all carry a
   nullable day rate that nobody has filled in, and the P&L says `costed: false`
   until a real line exists — so the only way a cost enters the book is somebody
   typing one they have an invoice for. */

function done(): ActionResult {
  revalidatePath("/bridge/pnl");
  revalidatePath("/bridge/reports");
  return {};
}

/* An id off a stale row reaches the driver as a malformed uuid, and the
   driver's refusal — flattened to "didn't land" — invites a retry that cannot
   work. Caught here and said as a row, with the fix. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_NIGHT = "That night is not on the chart — reload the page.";
const NO_LINE = "That line is no longer in the book — reload the page.";
const NOTE_MAX = 200;

export async function addExpense(
  episodeId: string,
  kind: string,
  amountCents: number,
  note: string,
  settled: boolean
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(episodeId)) return { error: NO_NIGHT };
  /* Judged on the cents that will be written: 0.4 of a cent is "an amount"
     until it is rounded, and then it is a zero line in the book. */
  const cents = Math.round(amountCents);
  if (!Number.isFinite(cents) || cents <= 0) {
    return { error: "A cost needs an amount." };
  }
  /* A hundred thousand dollars on one line of one night is a typo far more
     often than it is a charter, and the ceiling is cheaper than the correction. */
  if (cents > 10_000_000) {
    return { error: "That is over $100,000 on one line — check the figure, or split it." };
  }
  /* kind is a foreign key onto expense_kinds. The form offers the catalogue;
     the wire is checked against it too, and refused by name rather than as a
     foreign key violation. */
  const { data: known } = await supabase.from("expense_kinds").select("slug").eq("slug", kind).maybeSingle();
  if (!known) return { error: "That is not a kind of cost the book keeps." };
  const { error } = await supabase.from("episode_expenses").insert({
    episode_id: episodeId,
    kind,
    amount_cents: cents,
    note: note.trim().slice(0, NOTE_MAX) || null,
    settled,
    created_by: staffId,
  });
  /* The remaining foreign key: an episode struck since the page loaded. */
  if (error) return { error: error.code === "23503" ? NO_NIGHT : ERR_LAND };
  return done();
}

export async function settleExpense(expenseId: string, settled: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(expenseId)) return { error: NO_LINE };
  const { data, error } = await supabase
    .from("episode_expenses")
    .update({ settled })
    .eq("id", expenseId)
    .select("id");
  if (error) return { error: ERR_LAND };
  /* A line somebody else removed is still on this screen until it reloads;
     the update lands on nothing and Postgres calls that success. */
  if (!data?.length) return { error: NO_LINE };
  return done();
}

export async function removeExpense(expenseId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(expenseId)) return { error: NO_LINE };
  const { data, error } = await supabase.from("episode_expenses").delete().eq("id", expenseId).select("id");
  if (error) return { error: ERR_LAND };
  if (!data?.length) return { error: NO_LINE };
  return done();
}
