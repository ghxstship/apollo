import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { clientKey, overLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/* A ceiling on the door, not a lock on it.

   Every call here is unauthenticated and spends an outbound verifyOtp on
   Supabase, which paces its own side — so this is about the flood, not about
   guessing: a token_hash is not something anyone reaches by trying. The number
   is deliberately generous because the failure mode of getting it wrong is a
   member who cannot sign in, and one address can legitimately be a whole
   venue's wifi on an episode night.

   A throttled caller is sent to the gangway with no error at all rather than
   to a JSON refusal a browser cannot use, or to `expired`, which would be the
   club telling a member their link had died when it had not. */
const LIMIT = 120;
const WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  if (overLimit(`auth-confirm:${clientKey(request)}`, LIMIT, WINDOW_MS)) {
    return NextResponse.redirect(new URL("/gangway", request.url));
  }

  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
  const type = (OTP_TYPES as readonly string[]).includes(rawType ?? "") ? (rawType as EmailOtpType) : null;
  const next = safeNext(searchParams.get("next"));

  if (token_hash && type && token_hash.length <= 512) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/gangway?error=expired", request.url));
}
