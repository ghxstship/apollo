import { NextResponse, type NextRequest } from "next/server";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/* POST /api/stripe/portal — a Stripe Billing Portal session for the signed-in
   member: card on file, dues cancellation, invoice history. */

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
      return_url: `${request.nextUrl.origin}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "The processor is unavailable. Try again shortly." },
      { status: 502 }
    );
  }
}
