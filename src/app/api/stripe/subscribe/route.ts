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
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const meta = { profile_id: user.id, plan_id: plan.id, interval };
    const origin = request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: meta,
      subscription_data: { metadata: meta },
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
