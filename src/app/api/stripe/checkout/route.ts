import { NextResponse } from "next/server";
import { ANCHOR } from "@/lib/brand";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { crossSiteRefusal } from "@/lib/request-guards";
import { overLimit, tooMany } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/site-origin";
import { createClient } from "@/lib/supabase/server";
import { stepUpRefusal } from "@/lib/supabase/step-up";

/* POST /api/stripe/checkout — start a Checkout Session that settles the
   member's negative house-account balance. */

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

  /* One member cannot open sessions at the processor faster than a person
     clicks. The idempotency key below already collapses the same balance into
     one session; this bounds the ones that differ. */
  if (overLimit(`stripe-checkout:${user.id}`, 10, 60_000)) {
    return tooMany({ error: "That's more settlements than the desk can open at once. Try again shortly." }, 60);
  }

  const { data: account } = await supabase
    .from("account_balance")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const balanceCents = account?.balance_cents ?? 0;
  if (balanceCents >= 0) {
    return NextResponse.json({ error: "Nothing owing." }, { status: 400 });
  }

  /* Configuration's origin, not the request's: this is where Stripe sends the
     member after they have paid, and a Host header is the caller's to write. */
  const origin = siteOrigin();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: -balanceCents,
          product_data: { name: `${ANCHOR} — member account settlement` },
        },
      },
    ],
    metadata: { profile_id: user.id },
    success_url: `${origin}/portal?settled=1`,
    cancel_url: `${origin}/portal`,
  }, {
    /* Two clicks made two sessions, and both could be paid — the member
       ended the night in credit. One balance, one session: Stripe returns the
       same session for the same key inside its 24-hour window. */
    idempotencyKey: `settle:${user.id}:${-balanceCents}`,
  });

  return NextResponse.json({ url: session.url });
}
