import { NextResponse, type NextRequest } from "next/server";

/* The URL inside a wallet pass. The gangway scans it and asks
   verify_wallet_token; a person who opens it in a browser is a member looking
   at their own pass, and the card is where that goes. A handler rather than a
   page: nothing renders, the token never reaches the address bar of a page,
   and the response carries no-store so a shared phone keeps nothing. */
export async function GET(request: NextRequest) {
  /* The request's own origin, deliberately. This is a redirect handed straight
     back to the caller who just reached this host, so it can only ever point
     them somewhere they already are — nothing leaves the process, and no
     credential rides on it. The rule that a link LEAVING the process is built
     from configuration instead lives in lib/site-origin.ts. */
  const res = NextResponse.redirect(new URL("/card", request.nextUrl.origin), 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
