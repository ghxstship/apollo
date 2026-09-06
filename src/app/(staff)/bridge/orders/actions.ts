"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { logTime, price } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { voice } from "@/lib/errors";
import { asText, isId } from "@/lib/arg";

function done(): ActionResult {
  revalidatePath("/bridge/orders");
  return {};
}

/* account_ledger.kind is a text column with no constraint naming these two, so
   a wire that sent anything at all put that word in the book — and the P&L, the
   member's own account page and every reconciliation read it back as a kind of
   entry the club does not have. Typed is not checked; every sibling in this
   file validates its enum, and this one did not. */
const LEDGER_KINDS = new Set(["payment", "refund"]);

/* The most one operator may put on a member account in a single house credit.
   club_setting('house_credit_max_cents'), which is the same figure the ledger
   trigger reads — asked here so an operator meets a sentence and a second
   Select before they post, and enforced there so a wire that never opens this
   file meets it anyway.

   Null means the setting could not be read, which is not a licence: the
   trigger refuses a house credit outright when it is missing, and so do we.

   Not exported: every export from a "use server" module becomes an endpoint a
   client can call, and this one takes a Supabase client, which is not a thing
   that crosses that wire. It is read inside the two actions that need it. */
type Reader = Awaited<ReturnType<typeof staffContext>>["supabase"];
async function houseCreditCeiling(supabase: Reader): Promise<number | null> {
  const { data } = await supabase.rpc("club_setting", { p_key: "house_credit_max_cents" });
  return typeof data === "number" ? data : null;
}

const CEILING_UNSET =
  "The house credit ceiling isn't set, so no credit can be posted. Set it in the club settings.";

/* Everything the second operator has to satisfy before the row is written, said
   as sentences. The ledger refuses the same three things; these exist so the
   operator is told which one they tripped rather than being handed a trigger. */
function secondNameProblem(
  cents: number,
  ceiling: number,
  seconded: string | null,
  staffId: string
): string | null {
  if (cents <= ceiling) return null;
  if (!seconded)
    return `A credit above ${price(ceiling)} needs a second operator to put their name on it.`;
  if (!isId(seconded)) return "Pick the operator seconding this credit.";
  if (seconded === staffId) return "A credit is not seconded by the person posting it.";
  return null;
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
  evenIfItLooksLikeARepeat = false,
  /* The colleague seconding a house credit above the ceiling. Ignored on a
     payment, and on a credit that does not need one. */
  secondedBy: string | null = null
): Promise<ActionResult & { looksLikeARepeat?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const cents = Math.round(amountCents);
  if (!LEDGER_KINDS.has(kind)) return { error: "An entry is a payment or a refund." };
  if (!isId(profileId)) return { error: "Pick a member first." };
  if (!Number.isFinite(cents) || cents <= 0) return { error: "Enter an amount above zero." };

  /* A hand-typed refund carries no Stripe object, which makes it the house
     credit — money the club gives back with nothing behind it. Above one pass
     it takes two people. */
  let seconded: string | null = null;
  if (kind === "refund") {
    const ceiling = await houseCreditCeiling(supabase);
    if (ceiling === null) return { error: CEILING_UNSET };
    const problem = secondNameProblem(cents, ceiling, secondedBy, staffId);
    if (problem) return { error: problem };
    seconded = cents > ceiling ? secondedBy : null;
  }

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
    memo: asText(memo).trim() || null,
    created_by: staffId,
    seconded_by: seconded,
  });
  /* The ledger's own refusals are sentences — the ceiling, the second name,
     the refund cap — so hand them on rather than flattening them to "that
     didn't land", which is what an operator used to get for every one. */
  if (error) return { error: voice(error) };
  return done();
}

/* Approve a chandlery refund — flips the order, credits the account,
   and queues the receipt email. */
export async function refundShopOrder(
  orderId: string,
  /* A Shop refund is credit to the member account with no Stripe object on the
     row, so it is a house credit like any other and meets the same ceiling. */
  secondedBy: string | null = null
): Promise<ActionResult> {
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

  /* Refund what was charged, not what was listed. charge_shop_order posts
     total_cents minus discount_cents, so crediting the gross handed back the
     discount as real account credit on every order-then-refund cycle — a
     purchase quietly paying the member. */
  const refundCents = Math.max((order.total_cents ?? 0) - (order.discount_cents ?? 0), 0);

  /* Asked BEFORE the flip below, and that ordering is the point: the flip is
     the guard, and a refusal after it leaves an order marked refunded with no
     money behind it. */
  const ceiling = await houseCreditCeiling(supabase);
  if (ceiling === null) return { error: CEILING_UNSET };
  const problem = secondNameProblem(refundCents, ceiling, secondedBy, staffId);
  if (problem) return { error: problem };
  const seconded = refundCents > ceiling ? secondedBy : null;

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

  const { error: ledgerError } = await supabase.from("account_ledger").insert({
    profile_id: order.profile_id,
    delta_cents: refundCents,
    kind: "refund",
    memo: `Shop order ${asText(orderId).slice(0, 8).toUpperCase()} refunded`,
    created_by: staffId,
    seconded_by: seconded,
  });
  if (ledgerError) return { error: voice(ledgerError) };

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

/* — money that actually goes back — */

/* Until now "refund" in this club meant account credit, and the member kept a
   balance they might never spend. This sends it to the card.
 *
 * It posts NOTHING to the ledger. The webhook does that, on charge.refunded,
 * keyed on the refund id — so the book cannot claim a refund Stripe declined,
 * a refund issued by hand in the Stripe dashboard is recorded identically, and
 * a redelivered event cannot double it. The request and the record are separate
 * on purpose.
 */
export async function refundToCard(
  /* The settlement being reversed, by the Stripe object the ledger recorded. */
  stripeRef: string,
  amountCents: number,
  reason: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!stripeEnabled()) {
    return { error: "Stripe is not configured on this deployment — settle it by hand and post a credit." };
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { error: "A refund needs an amount." };
  }

  /* The row must exist, must be a payment, and must be the one named — the
     operator names a settlement, never a raw Stripe id from somewhere else. */
  const { data: settled } = await supabase
    .from("account_ledger")
    .select("delta_cents, profile_id")
    .eq("stripe_ref", stripeRef)
    .eq("kind", "payment")
    .limit(1)
    .maybeSingle();
  if (!settled) return { error: "No settlement on file for that payment." };

  /* Already refunded, in whole or in part. Stripe would refuse an over-refund
     itself, but its message is for a developer and this one is for a person. */
  /* Dues settlements posted before 2026-09-04 recorded the INVOICE id, and a
     refund is issued against the payment intent. Resolve it through Stripe's
     own record of what paid the invoice, rather than refusing the refund. The
     webhook keys refund and dispute rows on the intent, so the already-back
     sum has to be read under both names. */
  let intent = stripeRef;
  if (stripeRef.startsWith("in_")) {
    try {
      const paid = await getStripe().invoicePayments.list({ invoice: stripeRef, limit: 1 });
      const pi = paid.data[0]?.payment?.payment_intent;
      intent = typeof pi === "string" ? pi : pi?.id ?? "";
    } catch {
      intent = "";
    }
    if (!intent) return { error: "Stripe has no card payment on file for that invoice." };
  }

  const { data: back } = await supabase
    .from("account_ledger")
    .select("delta_cents")
    .in("stripe_ref", intent === stripeRef ? [stripeRef] : [stripeRef, intent])
    .in("kind", ["refund", "dispute"]);
  const alreadyBack = (back ?? []).reduce((sum, r) => sum + Math.abs(r.delta_cents), 0);
  const refundable = settled.delta_cents - alreadyBack;
  if (amountCents > refundable) {
    return {
      error:
        refundable <= 0
          ? "That payment has already been returned in full."
          : `Only ${price(refundable)} of that payment is left to refund.`,
    };
  }

  try {
    await getStripe().refunds.create({
      payment_intent: intent,
      amount: amountCents,
      /* Read back in the Stripe dashboard by whoever asks why. */
      metadata: { reason: asText(reason).slice(0, 200), by: staffId },
    });
  } catch {
    /* Never the provider's error text: it carries ids and card detail, and this
       lands in a toast a member could be standing next to. */
    return { error: "Stripe refused that refund. Check the payment in Stripe." };
  }

  revalidatePath("/bridge/orders");
  return {};
}
