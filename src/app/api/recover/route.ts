import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBounded } from "@/lib/request-guards";
import { overLimit } from "@/lib/rate-limit";
import { callerAddress } from "@/lib/caller-address";

/* POST /api/recover — the way back in for a member who has lost their
   authenticator.

   Before this route existed, losing the phone was permanent. The reset link and
   the magic link both work and both land a session at the first assurance
   level; the proxy then sends every protected page to /gangway/verify, which is
   the one screen they cannot pass; and switching two-step off requires the
   level they cannot reach. They were locked out of /account at the same time,
   which is where their money, their invoices and their data export live.

   WHAT A CODE CAN AND CANNOT DO, because the difference is the whole design.
   The assurance level belongs to the auth provider and is minted only when a
   factor is actually proven, so nothing here can hand anybody AAL2 — a design
   that pretended otherwise would be a second way in the provider does not know
   about. What a code CAN do is establish that this is the right person well
   enough to REMOVE the factor. Once no verified factor exists, the proxy and
   both step-up guards stop asking, and an ordinary session is enough again.
   The member is back in, no longer protected by two-step, and told to enrol
   again — which is correct, because a member who has lost their authenticator
   does not have one.

   NOT CSRF-guarded, and deliberately: the caller has no session to forge, which
   is the situation. What guards it instead is that the code is a credential
   nobody else holds, that spending one is single-use and locked, that the whole
   Bridge is told every time one is spent, and the limits below.

   The response says the same thing whether the address is unknown, the code is
   wrong, or the member has no two-step at all. Anything else turns this into a
   way to ask whether somebody is a member. */

export const dynamic = "force-dynamic";

const SAME_ANSWER = "That address and code do not go together. Check the sheet you printed when you turned two-step on.";

export async function POST(request: Request) {
  /* Two limits, because they stop different things. The address limit stops
     somebody working through codes against one member; the caller limit stops
     one machine working through members. Both are tight — a person reading a
     code off paper does not need ten tries a minute. */
  const from = callerAddress(request.headers);
  if (overLimit(`recover-ip:${from ?? "unknown"}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const raw = await readBounded(request, 2 * 1024);
  let body: Record<string, unknown> = {};
  try {
    body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  /* Normalised the way it is printed: the sheet groups it with hyphens and
     nobody types those reliably, and a code read aloud arrives in whatever
     case the reader felt like. */
  const code = (typeof body.code === "string" ? body.code : "").toUpperCase().replace(/[^0-9A-Z]/g, "");

  if (!email.includes("@") || code.length !== 12) {
    return NextResponse.json({ error: SAME_ANSWER }, { status: 400 });
  }
  if (overLimit(`recover-who:${email}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  /* No such member reads exactly like a wrong code. */
  if (!profile) {
    return NextResponse.json({ error: SAME_ANSWER }, { status: 400 });
  }

  /* Hashed the same way it was stored: the plain code never reaches the
     database, and the sheet is the only place it ever existed. */
  const hash = createHash("sha256")
    .update(`${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`)
    .digest("hex");

  const { data: spent, error } = await admin.rpc("spend_recovery_code", {
    p_profile: profile.id,
    p_hash: hash,
  });
  if (error) {
    return NextResponse.json({ error: "That didn't land. Try once more." }, { status: 502 });
  }
  if (spent !== true) {
    return NextResponse.json({ error: SAME_ANSWER }, { status: 400 });
  }

  /* The code was good, so the factor goes. Every factor, not the first: a
     member may have enrolled twice, and leaving one standing would leave them
     exactly as locked out as before while having spent a code for nothing. */
  const { data: listed } = await admin.auth.admin.mfa.listFactors({ userId: profile.id });
  let removed = 0;
  for (const f of listed?.factors ?? []) {
    const { error: gone } = await admin.auth.admin.mfa.deleteFactor({ userId: profile.id, id: f.id });
    if (!gone) removed += 1;
  }

  /* The code is spent whether or not a factor was there to remove, and that is
     deliberate: a member who had already turned two-step off is not told their
     sheet was wrong, and a spent code is a line in the record either way. */
  return NextResponse.json(
    {
      done: true,
      removed,
      message:
        "Two-step is off. Sign in with your password, then turn two-step back on from your settings — and print the new sheet. The Bridge has been told.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
