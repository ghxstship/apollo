import { NextResponse, type NextRequest } from "next/server";
import { clientKey, overLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/* Where a provider sends the member back. The code is exchanged for a session
   here; the roll trigger on auth.users refuses a first sign-in from an address
   that is not on it, and that refusal is said as "no pass", never as a
   provider error. */
/* The same ceiling, and the same reasoning, as /auth/confirm beside it: an
   unauthenticated call that spends an outbound exchange, generous enough that
   a shared address never meets it, and a throttled caller lands at the door
   rather than on a refusal a browser cannot read. */
const LIMIT = 120;
const WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  if (overLimit(`auth-callback:${clientKey(request)}`, LIMIT, WINDOW_MS)) {
    return NextResponse.redirect(new URL("/gangway", request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code && code.length <= 512) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    const reason = /member roll|not on the/i.test(error.message) ? "no-pass" : "provider";
    return NextResponse.redirect(new URL(`/gangway?error=${reason}`, request.url));
  }
  return NextResponse.redirect(new URL("/gangway?error=provider", request.url));
}
