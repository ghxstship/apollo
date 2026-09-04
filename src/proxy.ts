import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/* Next 16 calls this the proxy; it is the file that used to be middleware,
   and it runs before any route renders. Two jobs, in this order:

   1. The dev-only document preview does not exist in a production build.
      The page already answers notFound() under NODE_ENV=production, and the
      route audit asserts it. This is the second lock on the same door — it
      holds even if that page is edited, and it costs the request nothing,
      because it is decided before a session is even looked for. The rewrite
      lands on an address no page owns, so the club's own 404 renders, which
      is what the audit reads for.

   2. Refresh the member's session and keep the gate on the member and staff
      route groups. That lives in updateSession, next to the list of what is
      behind the gangway — and so does the one header the proxy stamps, which
      names a request for /bridge/gangway so the (staff) layout can admit a
      hired door on that screen and no other. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (process.env.NODE_ENV === "production" && (path === "/preview" || path.startsWith("/preview/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/off-the-chart";
    url.search = "";
    return NextResponse.rewrite(url, { status: 404 });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /* Run on everything except what carries no session and needs none:
       Next's own assets, the icon set, the worker script, the manifest and
       every static file by extension — and the Stripe webhook, which arrives
       with a signature rather than a cookie and must never be slowed or
       redirected by the gate. The MCP endpoint is excluded on the same
       reasoning: it is authenticated by a bearer API key on every call, carries
       no cookie and refreshes no session, so running the session refresh on it
       would be a database round trip that decides nothing. Its own handler
       verifies the key. */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|icons/|logo/|api/stripe/webhook|api/mcp|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|woff2?)$).*)",
  ],
};
