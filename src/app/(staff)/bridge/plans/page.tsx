import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { stripeEnabled } from "@/lib/stripe";
import { PlansClient, type PlanRow } from "./plans-client";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const { supabase } = await getOperator();

  const [plansRes, holdersRes] = await Promise.all([
    supabase.from("membership_plans").select("*").eq("active", true).order("price_cents"),
    supabase.from("profiles").select("plan_id"),
  ]);

  const held = new Map<string, number>();
  for (const r of must(holdersRes)) {
    if (r.plan_id) held.set(r.plan_id, (held.get(r.plan_id) ?? 0) + 1);
  }

  const plans: PlanRow[] = must(plansRes).map((p) => ({
    id: p.id,
    label: p.label,
    planType: p.plan_type,
    tier: p.tier,
    priceCents: p.price_cents,
    annualCents: p.annual_price_cents,
    creditCents: p.monthly_credit_cents,
    priceId: p.stripe_price_id,
    annualPriceId: p.stripe_price_id_annual,
    published: p.published,
    holders: held.get(p.id) ?? 0,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Plans</span>
      <h1 className="hm-h1">What dues cost, and whether they can be paid.</h1>
      {/* The price id is the whole point of this screen. Everything else about a
          plan is set in a migration; this is the one field that has to be typed
          by a person, because the price it names is created by a person in
          Stripe and the two have to be matched by hand. */}
      <p className="hm-lede">
        A tier is only sellable once it carries the Stripe price it sells at.
        Create the price in Stripe first, then record its id here.
      </p>
      <PlansClient plans={plans} stripeLive={stripeEnabled()} />
    </div>
  );
}
