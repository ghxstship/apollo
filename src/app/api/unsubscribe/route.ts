import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { overLimit } from "@/lib/rate-limit";

/* POST and GET /api/unsubscribe?t=<token> — the one thing on this deployment
   that answers an unauthenticated request by changing something.

   RFC 8058 one-click requires exactly this: a URL in List-Unsubscribe-Post that
   acts on a POST with no session, no confirmation page and no interaction. Mail
   clients POST it when the reader presses the unsubscribe control the client
   itself draws, and a sender that advertises the header without honouring it is
   worse off than one that never advertised it — Gmail and Yahoo have required
   one-click on bulk mail since 2024, and failing it is a deliverability
   penalty, not a warning.

   DELIBERATELY NOT CSRF-PROTECTED, which is the one thing about this file worth
   pausing on. crossSiteRefusal() guards every other mutating route here, and
   applying it would break the specification: the POST arrives from a mail
   client with no origin the club would recognise. The exposure that creates is
   the whole of what an attacker gains — the ability to unsubscribe somebody
   from marketing mail, if they already hold that person's token. They cannot
   read anything, cannot sign in, and cannot reach any other address. Against
   that: the token is opaque, single-purpose and revocable, and the member can
   turn the switches back on from their settings. This is the trade the RFC
   itself makes, and it is a sound one.

   GET is answered too. The same URL sits in the List-Unsubscribe header as a
   link, some clients follow it rather than posting, and a reader who copies it
   into a browser deserves the same outcome as one who pressed the button. */

export const dynamic = "force-dynamic";

async function stop(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  /* Shape-checked before the database is touched, in the pattern the API keys
     use: a malformed token is not a lookup, it is noise. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "That is not an unsubscribe link." }, { status: 400 });
  }

  /* Keyed on the token rather than the caller. There is no caller to key on —
     no session, and the address belongs to a mail provider's fetcher as often
     as to a person. Generous, because a client that retries is normal and the
     function answers true for an already-spent token anyway. */
  if (overLimit(`unsub:${token}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("spend_unsubscribe_token", {
    p_token: token,
    p_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "That didn't land. Try the link in the letter again." }, { status: 502 });
  }
  if (data !== true) {
    /* An unknown token. Deliberately the same shape as a malformed one and
       nothing more: whether a given token exists is not a question this
       endpoint answers for anybody who asks. */
    return NextResponse.json({ error: "That is not an unsubscribe link." }, { status: 400 });
  }

  return NextResponse.json(
    { done: true, message: "Done — the club will stop sending you letters it chose to send. Notices about a pass you hold still come." },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  return stop(request);
}

export async function GET(request: Request) {
  return stop(request);
}
