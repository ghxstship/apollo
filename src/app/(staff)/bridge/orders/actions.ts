"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { logTime, price } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/orders");
  return {};
}

/* Post a payment or refund to a member account — positive deltas, logged
   with the operator's name. Confirm-first in the UI. */
export async function postLedgerEntry(
  profileId: string,
  kind: "payment" | "refund",
  amountCents: number,
  memo: string,
  /* Set only when the operator has been shown a matching recent entry and said
     it is genuinely a second one. */
  evenIfItLooksLikeARepeat = false
): Promise<ActionResult & { looksLikeARepeat?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const cents = Math.round(amountCents);
  if (!profileId) return { error: "Pick a member first." };
  if (!Number.isFinite(cents) || cents <= 0) return { error: "Enter an amount above zero." };

  /* This is the manual sibling of refundShopOrder, which is properly guarded.
     Here two operators working the same request both post, neither is warned,
     and the member is refunded twice out of the club's money. There is no
     natural key for a hand-typed entry, so this does not silently dedupe —
     that would swallow a genuine second refund. It surfaces the match and
     makes a person decide. */
  if (!evenIfItLooksLikeARepeat) {
    const { data: recent } = await supabase
      .from("account_ledger")
      .select("created_at")
      .eq("profile_id", profileId)
      .eq("kind", kind)
      .eq("delta_cents", cents)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) {
      return {
        looksLikeARepeat: `An identical ${kind} for this member was posted at ${logTime(recent.created_at, CLUB_ZONE)}. Post it again only if it is genuinely a second one.`,
      };
    }
  }

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

  /* The flip IS the guard. Reading the status and then updating leaves a
     window every concurrent call walks through: four simultaneous approvals
     each read "refund_requested", each passed the check, and each credited the
     account — $435.20 back on a $108.80 order, with no error shown to the
     operator. Narrowing the update to the status we expect means the database
     decides who wins, and only the winner gets a row back. */
  const { data: flipped, error: statusError } = await supabase
    .from("shop_orders")
    .update({ status: "refunded" })
    .eq("id", orderId)
    .eq("status", "refund_requested")
    .select("id");
  if (statusError) return { error: ERR_LAND };
  if (!flipped || flipped.length === 0) {
    return { error: "That refund was already approved." };
  }

  /* Refund what was charged, not what was listed. charge_shop_order posts
     total_cents minus discount_cents, so crediting the gross handed back the
     discount as real account credit on every order-then-refund cycle — a
     purchase quietly paying the member. */
  const refundCents = Math.max(
    (order.total_cents ?? 0) - (order.discount_cents ?? 0),
    0
  );

  const { error: ledgerError } = await supabase.from("account_ledger").insert({
    profile_id: order.profile_id,
    delta_cents: refundCents,
    kind: "refund",
    memo: `The Shop order ${orderId.slice(0, 8).toUpperCase()} refunded`,
    created_by: staffId,
  });
  if (ledgerError) return { error: ERR_LAND };

  /* email_outbox is definer-write only. The credit has already posted, so a
     receipt that fails to queue must not fail the refund — it is reported
     instead, and the member's ledger still shows the money back. */
  if (member?.email) {
    const { error: receiptError } = await supabase.rpc("queue_email", {
      p_to: member.email,
      p_template: "refund-posted",
      p_payload: { name: member.full_name ?? "sailor", amount: price(refundCents) },
    });
    if (receiptError) {
      return { error: "Refunded and credited, but the receipt did not queue." };
    }
  }

  return done();
}
