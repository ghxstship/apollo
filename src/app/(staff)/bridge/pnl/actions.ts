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

export async function addExpense(
  episodeId: string,
  kind: string,
  amountCents: number,
  note: string,
  settled: boolean
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { error: "A cost needs an amount." };
  }
  /* A hundred thousand dollars on one line of one night is a typo far more
     often than it is a charter, and the ceiling is cheaper than the correction. */
  if (amountCents > 10_000_000) {
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
    amount_cents: Math.round(amountCents),
    note: note.trim().slice(0, 200) || null,
    settled,
    created_by: staffId,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function settleExpense(expenseId: string, settled: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("episode_expenses")
    .update({ settled })
    .eq("id", expenseId);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function removeExpense(expenseId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("episode_expenses").delete().eq("id", expenseId);
  if (error) return { error: ERR_LAND };
  return done();
}
