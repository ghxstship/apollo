import { NextResponse, type NextRequest } from "next/server";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/* POST /api/stripe/checkout — start a Checkout Session that settles the
   member's negative house-account balance. */

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

  const { data: account } = await supabase
    .from("account_balance")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  const balanceCents = account?.balance_cents ?? 0;
  if (balanceCents >= 0) {
    return NextResponse.json({ error: "Nothing owing." }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: -balanceCents,
          product_data: { name: "SYRIUS SOCIAL — member account settlement" },
        },
      },
    ],
    metadata: { profile_id: user.id },
    success_url: `${origin}/portal?settled=1`,
    cancel_url: `${origin}/portal`,
  });

  return NextResponse.json({ url: session.url });
}
