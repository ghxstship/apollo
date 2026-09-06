import { NextResponse } from "next/server";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { crossSiteRefusal, readBounded } from "@/lib/request-guards";
import { overLimit, tooMany } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";
import { stepUpRefusal } from "@/lib/supabase/step-up";

/* POST /api/stripe/subscribe — start a Checkout Session in subscription mode
   for a membership plan's dues. Body: { planId, interval: "month" | "year" }.
   The plan and its price id are read shoreside; the client only names a plan. */

export async function POST(request: Request) {
  const crossSite = crossSiteRefusal(request);
  if (crossSite) return crossSite;
  if (!stripeEnabled()) {
    return NextResponse.json({ disabled: true }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const stepUp = await stepUpRefusal(supabase, user);
  if (stepUp) return stepUp;

  if (overLimit(`stripe-subscribe:${user.id}`, 10, 60_000)) {
    return tooMany({ error: "That's more standings than the desk takes at once. Try again shortly." }, 60);
  }

  /* A plan id and an interval. Nothing that names one is large. */
  const raw = await readBounded(request, 8 * 1024);
  let body: Record<string, unknown> = {};
  try {
    body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const planId = typeof body.planId === "string" ? body.planId : null;
  const interval = body.interval === "year" ? "year" : "month";
  if (!planId) {
    return NextResponse.json({ error: "Name a plan first." }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from("membership_plans")
    .select("*")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "That standing is off the manifest." }, { status: 400 });
  }

  const priceId = interval === "year" ? plan.stripe_price_id_annual : plan.stripe_price_id;
  if (!priceId) {
    return NextResponse.json(
      {
        error: `Dues for ${plan.label} aren't running yet — Shoreside settles that standing by hand.`,
      },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  /* The standing already held, if there is one. This read is the whole of a
     defect that would have doubled somebody's dues the day the rail turned on:
     both "take this standing" on the membership page and "move to this" in the
     account opened a Checkout in subscription mode, unconditionally. Checkout
     in that mode CREATES — it does not move — so a member switching monthly to
     annual, or Deck to Cabin, would have finished with two live subscriptions
     at Stripe and been billed for both. Our own side would not have shown it:
     syncSubscription upserts on the Stripe id, so the second one INSERTs, and
     the insert is refused by subscriptions_one_live_per_member with the error
     discarded. Stripe billing twice while the database calmly holds one row is
     the worst shape this could have taken, because nothing surfaces it but a
     member's statement.

     The idempotency key on the session below does not help here. It is keyed
     on the plan and interval being joined, so it collapses two attempts at the
     SAME move and does nothing about a move to a DIFFERENT one, which is the
     only kind anybody makes twice. */
  const { data: standing } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status, interval, plan_id")
    .eq("profile_id", user.id)
    .in("status", ["active", "trialing", "past_due", "paused"])
    .maybeSingle();

  try {
    const stripe = getStripe();
    let customerId = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { profile_id: user.id },
      });
      customerId = customer.id;
      /* Claimed through an RPC rather than written straight to the column: the
         portal opens whatever customer sits on the profile, so the claim has to
         refuse an id another member already holds. The column itself is closed
         to members by a guard trigger. */
      const { error: claimError } = await supabase.rpc("claim_stripe_customer", {
        p_customer_id: customerId,
      });
      if (claimError) {
        return NextResponse.json(
          { error: "That billing account could not be opened." },
          { status: 400 }
        );
      }
    }

    /* A member who already holds a live standing is MOVING, and a move is an
       update to the subscription they have — one subscription throughout, and
       Stripe does the arithmetic. create_prorations credits the unused part of
       what they paid for and charges the difference on the next invoice rather
       than billing immediately, which is the reading that matches the club's
       own promise that a standing runs to the end of what was paid for.

       Same price id is not an error and not a no-op worth an exception: it is
       somebody pressing the standing they already hold. Send them back to the
       account rather than asking Stripe to replace an item with itself. */
    if (standing?.stripe_subscription_id) {
      const live = await stripe.subscriptions.retrieve(standing.stripe_subscription_id);
      const currentItem = live.items?.data?.[0] ?? null;
      if (!currentItem) {
        /* A live row pointing at a subscription with no item is not something
           this route can move. Refusing is the only honest answer — opening a
           Checkout here is exactly the double bill. */
        return NextResponse.json(
          { error: "That standing can't be moved from here. Shoreside settles it by hand." },
          { status: 409 }
        );
      }
      if (currentItem.price?.id === priceId) {
        return NextResponse.json({ url: `${siteOrigin()}/account` });
      }
      await stripe.subscriptions.update(
        standing.stripe_subscription_id,
        {
          items: [{ id: currentItem.id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { profile_id: user.id, plan_id: plan.id, interval },
        },
        {
          /* Keyed on where they are going, so a double-click is one move. */
          idempotencyKey: `move:${user.id}:${plan.id}:${interval}`,
        }
      );
      /* customer.subscription.updated carries the rest — the row, the plan and
         the wallet card are the webhook's to write, as they are for every other
         change Stripe makes. Nothing is written here. */
      return NextResponse.json({ url: `${siteOrigin()}/account?moved=1` });
    }

    const meta = { profile_id: user.id, plan_id: plan.id, interval };
    /* Configuration's origin — see lib/site-origin.ts. */
    const origin = siteOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: meta,
      subscription_data: { metadata: meta },
      /* Dues are the one charge where Stripe is the right authority: a single
         recurring product, one tax code, and Stripe Tax charges ONLY in
         jurisdictions the club has registered in through the dashboard. So
         turning it on invents nothing — an unregistered state is charged
         nothing, which is the correct behaviour and not a silent default.

         Deliberately NOT enabled on the settlement checkout, which charges an
         aggregate house balance: one line covering passes, deposits, bar tabs
         and dues cannot carry one product code honestly, and anything already
         taxed at charge time would be taxed twice. */
      automatic_tax: { enabled: true },
      /* Stripe Tax needs somewhere to tax. Saving it to the customer means a
         member is asked once rather than at every renewal. */
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      success_url: `${origin}/account?joined=1`,
      cancel_url: `${origin}/membership`,
    }, {
      /* Two tabs on the membership page used to open two subscriptions and
         bill dues twice: the route read nothing before creating, and unlike
         the settlement checkout beside it carried no key. Keyed on the member
         and the plan they are joining, so a genuine second attempt at the same
         thing returns the first session rather than opening another. The
         database now says the same thing from its own side — one live
         membership per member. */
      idempotencyKey: `subscribe:${user.id}:${plan.id}:${interval}`,
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "The processor is unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
