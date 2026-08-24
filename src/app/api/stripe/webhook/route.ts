import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/lib/supabase/types";

/* POST /api/stripe/webhook — everything Stripe tells us, written shoreside
   with the service-role client. Nothing here trusts a request body beyond the
   signed event: the member is derived from the customer (or, failing that,
   from metadata we set ourselves when the session was created).

   Handled:
     checkout.session.completed        one-off settlement · new dues
     customer.subscription.*           standing, period, cancellation
     invoice.paid / .payment_failed    receipts, and the dues ledger entry
     payment_method.attached           card on file

   The DB trigger on subscriptions syncs profiles.status and drops the Word on
   past_due/canceled — deliberately not repeated here. */

type Admin = ReturnType<typeof createAdminClient>;

const STATUS: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "past_due",
  paused: "paused",
};

/* Stripe ids only — these reach a PostgREST or() filter. */
const STRIPE_ID = /^[A-Za-z0-9_]+$/;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function isoFrom(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/* "AUG 2026" — the period a dues charge covers, for the ledger memo. */
function periodLabel(seconds: number | null | undefined): string {
  if (!seconds) return "";
  return new Date(seconds * 1000)
    .toLocaleString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
}

async function profileFor(
  admin: Admin,
  customerId: string | null,
  metadata: Stripe.Metadata | null | undefined
): Promise<string | null> {
  if (customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  const fromMeta = metadata?.profile_id;
  if (!fromMeta) return null;
  const { data } = await admin.from("profiles").select("id").eq("id", fromMeta).maybeSingle();
  return data?.id ?? null;
}

async function planForPrice(admin: Admin, priceId: string | null) {
  if (!priceId || !STRIPE_ID.test(priceId)) return null;
  const { data } = await admin
    .from("membership_plans")
    .select("id, label")
    .or(`stripe_price_id.eq.${priceId},stripe_price_id_annual.eq.${priceId}`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/* One subscription row per Stripe subscription — upserted on the unique
   stripe_subscription_id, so replays and out-of-order events settle flat. */
async function syncSubscription(
  admin: Admin,
  sub: Stripe.Subscription,
  forcedStatus?: SubscriptionStatus
) {
  const profileId = await profileFor(admin, idOf(sub.customer), sub.metadata);
  if (!profileId) return;

  const item = sub.items?.data?.[0] ?? null;
  const plan = await planForPrice(admin, item?.price?.id ?? null);

  await admin.from("subscriptions").upsert(
    {
      profile_id: profileId,
      plan_id: plan?.id ?? null,
      stripe_subscription_id: sub.id,
      status: forcedStatus ?? STATUS[sub.status] ?? "incomplete",
      interval: item?.price?.recurring?.interval === "year" ? "year" : "month",
      current_period_end: isoFrom(item?.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
}

/* The plan a paid invoice belongs to, read back from our own subscription row
   rather than from the invoice payload. */
async function planLabelFor(admin: Admin, subscriptionId: string | null): Promise<string> {
  if (!subscriptionId) return "membership";
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub?.plan_id) return "membership";
  const { data: plan } = await admin
    .from("membership_plans")
    .select("label")
    .eq("id", sub.plan_id)
    .maybeSingle();
  return plan?.label ?? "membership";
}

/* Dues land on the house account as a matched pair — the charge for the
   period, and the card that settled it — so the statement reads true and the
   balance does not move.

   Idempotent on a KEY THE DATABASE ENFORCES, not on a memo this code looked up
   a round trip ago. Two concurrent deliveries of the same invoice.paid both
   read "no existing row" and both inserted; the balance nets out but the
   statement then shows a charge and a payment that never happened. */
async function postDues(admin: Admin, profileId: string, invoice: Stripe.Invoice) {
  const amount = invoice.amount_paid || invoice.total || 0;
  if (amount <= 0) return;

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const label = await planLabelFor(admin, subscriptionId);
  const period = periodLabel(invoice.period_start);
  const memo = `Dues — ${label}${period ? ` ${period}` : ""}`;

  const key = `stripe:invoice:${invoice.id}`;
  const { error } = await admin.from("account_ledger").insert([
    { profile_id: profileId, delta_cents: -amount, kind: "dues", memo, idem_key: `${key}:dues` },
    {
      profile_id: profileId,
      delta_cents: amount,
      kind: "payment",
      memo: `${memo} — settled by card`,
      idem_key: `${key}:payment`,
    },
  ]);
  /* 23505 is the unique index doing its job: this invoice has already been
     posted. That is the desired outcome, not a failure. */
  if (error && error.code !== "23505") throw error;
}

async function syncInvoice(admin: Admin, invoice: Stripe.Invoice) {
  const profileId = await profileFor(admin, idOf(invoice.customer), invoice.metadata);
  if (!profileId || !invoice.id) return;

  await admin.from("invoices").upsert(
    {
      profile_id: profileId,
      stripe_invoice_id: invoice.id,
      number: invoice.number,
      amount_cents: invoice.amount_paid || invoice.amount_due || invoice.total || 0,
      status: invoice.status ?? "open",
      hosted_url: invoice.hosted_invoice_url ?? null,
      pdf_url: invoice.invoice_pdf ?? null,
      period_start: isoFrom(invoice.period_start),
      period_end: isoFrom(invoice.period_end),
    },
    { onConflict: "stripe_invoice_id" }
  );

  if (invoice.status === "paid") await postDues(admin, profileId, invoice);
}

async function syncPaymentMethod(admin: Admin, method: Stripe.PaymentMethod) {
  const profileId = await profileFor(admin, idOf(method.customer), method.metadata);
  if (!profileId) return;

  await admin.from("payment_methods").upsert(
    {
      profile_id: profileId,
      stripe_payment_method_id: method.id,
      brand: method.card?.brand ?? null,
      last4: method.card?.last4 ?? null,
      exp_month: method.card?.exp_month ?? null,
      exp_year: method.card?.exp_year ?? null,
      is_default: true,
    },
    { onConflict: "stripe_payment_method_id" }
  );

  /* One default card per member — the newest attachment takes it. */
  await admin
    .from("payment_methods")
    .update({ is_default: false })
    .eq("profile_id", profileId)
    .neq("stripe_payment_method_id", method.id);
}

/* One-off house-account settlement — the original path, unchanged. */
async function postSettlement(admin: Admin, session: Stripe.Checkout.Session) {
  const profileId = session.metadata?.profile_id;
  if (session.payment_status !== "paid" || !profileId || !session.amount_total) return;

  const memo = `Card settlement — Stripe ${session.id}`;
  const { error } = await admin.from("account_ledger").insert({
    profile_id: profileId,
    delta_cents: session.amount_total,
    kind: "payment",
    memo,
    idem_key: `stripe:session:${session.id}:payment`,
  });
  /* Already posted by a concurrent delivery of the same event — say nothing
     more, and do not tell the member their payment arrived a second time. */
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }
  await admin.from("notifications").insert({
    profile_id: profileId,
    kind: "word",
    title: "Payment received.",
    body: "Your account is square. Fair winds.",
  });
}

export async function POST(request: NextRequest) {
  if (!stripeEnabled()) {
    return NextResponse.json({ disabled: true }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription") {
        const subscriptionId = idOf(session.subscription);
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(admin, sub);
        }
      } else if (session.mode === "payment") {
        await postSettlement(admin, session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(admin, event.data.object);
      break;
    case "customer.subscription.deleted":
      await syncSubscription(admin, event.data.object, "canceled");
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      await syncInvoice(admin, event.data.object);
      break;
    case "payment_method.attached":
      await syncPaymentMethod(admin, event.data.object);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
