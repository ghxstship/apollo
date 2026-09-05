import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/* Where a provider sends the member back. The code is exchanged for a session
   here; the roll trigger on auth.users refuses a first sign-in from an address
   that is not on it, and that refusal is said as "no pass", never as a
   provider error. */
export async function GET(request: NextRequest) {
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
