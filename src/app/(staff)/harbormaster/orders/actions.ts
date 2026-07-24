"use server";

import { revalidatePath } from "next/cache";
import { price } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/harbormaster/orders");
  return {};
}

/* Post a payment or refund to a member account — positive deltas, logged
   with the operator's name. Confirm-first in the UI. */
export async function postLedgerEntry(
  profileId: string,
  kind: "payment" | "refund",
  amountCents: number,
  memo: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const cents = Math.round(amountCents);
  if (!profileId) return { error: "Pick a member first." };
  if (!Number.isFinite(cents) || cents <= 0) return { error: "Enter an amount above zero." };
  const { error } = await supabase.from("account_ledger").insert({
    profile_id: profileId,
    delta_cents: cents,
    kind,
    memo: memo.trim() || null,
    created_by: staffId,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Approve a chandlery refund — flips the order, credits the account,
   and queues the receipt email. */
export async function refundShopOrder(orderId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { data: order } = await supabase
    .from("shop_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: ERR_LAND };
  if (order.status !== "refund_requested")
    return { error: "Only requested refunds can be approved here." };

  const { data: member } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", order.profile_id)
    .maybeSingle();

  const { error: statusError } = await supabase
    .from("shop_orders")
    .update({ status: "refunded" })
    .eq("id", orderId);
  if (statusError) return { error: ERR_LAND };

  const { error: ledgerError } = await supabase.from("account_ledger").insert({
    profile_id: order.profile_id,
    delta_cents: order.total_cents,
    kind: "refund",
    memo: `Chandlery order ${orderId.slice(0, 8).toUpperCase()} refunded`,
    created_by: staffId,
  });
  if (ledgerError) return { error: ERR_LAND };

  if (member?.email) {
    await supabase.from("email_outbox").insert({
      to_email: member.email,
      template: "refund-posted",
      payload: { name: member.full_name ?? "sailor", amount: price(order.total_cents) },
    });
  }

  return done();
}
