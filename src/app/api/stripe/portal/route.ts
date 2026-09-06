import { NextResponse } from "next/server";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { crossSiteRefusal } from "@/lib/request-guards";
import { overLimit, tooMany } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";
import { stepUpRefusal } from "@/lib/supabase/step-up";

/* POST /api/stripe/portal — a Stripe Billing Portal session for the signed-in
   member: card on file, dues cancellation, invoice history. */

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

  if (overLimit(`stripe-portal:${user.id}`, 10, 60_000)) {
    return tooMany({ error: "That's more portal sessions than the desk opens at once. Try again shortly." }, 60);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No dues on file yet. Take a standing first." },
      { status: 400 }
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      /* Where Stripe returns the member — configuration's to choose. */
      return_url: `${siteOrigin()}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "The processor is unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
