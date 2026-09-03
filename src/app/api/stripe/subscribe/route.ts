import { NextResponse, type NextRequest } from "next/server";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/* POST /api/stripe/subscribe — start a Checkout Session in subscription mode
   for a membership plan's dues. Body: { planId, interval: "month" | "year" }.
   The plan and its price id are read shoreside; the client only names a plan. */

export async function POST(request: NextRequest) {
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

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
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

    const meta = { profile_id: user.id, plan_id: plan.id, interval };
    const origin = request.nextUrl.origin;
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
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "The processor is unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
