import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/* POST /api/stripe/webhook — Stripe calls this after checkout. On a paid
   checkout.session.completed, post the payment to the house-account ledger
   (idempotent on the session id in the memo) and drop a Word. */

export async function POST(request: NextRequest) {
  if (!stripeEnabled()) {
    return NextResponse.json({ disabled: true }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const profileId = session.metadata?.profile_id;
    if (session.payment_status === "paid" && profileId && session.amount_total) {
      const memo = `Card settlement — Stripe ${session.id}`;
      const admin = createAdminClient();

      const { data: existing } = await admin
        .from("account_ledger")
        .select("id")
        .eq("memo", memo)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        await admin.from("account_ledger").insert({
          profile_id: profileId,
          delta_cents: session.amount_total,
          kind: "payment",
          memo,
        });
        await admin.from("notifications").insert({
          profile_id: profileId,
          kind: "word",
          title: "Payment received.",
          body: "Your account is square. Fair winds.",
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
