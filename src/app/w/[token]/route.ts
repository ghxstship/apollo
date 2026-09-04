import { NextResponse, type NextRequest } from "next/server";

/* The URL inside a wallet pass. The gangway scans it and asks
   verify_wallet_token; a person who opens it in a browser is a member looking
   at their own pass, and the card is where that goes. A handler rather than a
   page: nothing renders, the token never reaches the address bar of a page,
   and the response carries no-store so a shared phone keeps nothing. */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/card", request.nextUrl.origin), 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
