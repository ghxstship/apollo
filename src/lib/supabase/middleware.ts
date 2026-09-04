import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* Paths under these prefixes require a signed-in member. */
/* Legacy paths (/city, /wardroom, /card, /now, /harbormaster, /dispatch)
   need no entries: next.config redirects run before the proxy. */
/* /series came OFF this list on 2026-09-02. The catalogue of named strands is
   the single biggest thing the shore could not read: a visitor met a series
   only as an uppercase eyebrow on an episode card, and the page that explains
   what one IS sat behind the gate, in front of the one audience already
   convinced. It is a public page now, so the proxy must stop bouncing it —
   with the entry in place every signed-out visitor was redirected to /gangway
   before the page rendered a word. /the-show needs no entry for the same
   reason it needs no removal: it was never on this list, and it does not fall
   under /show, which matches only /show and /show/*. */
/* Mirrored by PRIVATE in public/sw.js — the worker must never write a page
   from any of these prefixes to disk. Change both together. The gate here is
   optimistic, per the Next 16 proxy docs: the (member) and (staff) layouts
   re-check the session, and every action and route handler checks its own. */
const PROTECTED = ["/home", "/passes", "/itinerary", "/membership/standing", "/open-deck", "/directory", "/threads", "/portal", "/account", "/card", "/inbox", "/you", "/live", "/shop", "/stub", "/regattas", "/tonight", "/matches", "/agreements", "/kiosk", "/bridge", "/vetting", "/radar", "/show", "/polls", "/season", "/debrief"];

/* /bridge is on the same list, and one address under it — the gangway — is
   the one Bridge screen a hired door may hold without being staff. The proxy
   cannot know who is staff (that is a database question, and the docs are
   clear it should not become one here), so it does the one thing only it
   can: it names the request. The (staff) layout reads getOperator(), which
   admits a door grant ONLY when this header says the request is for the
   gangway, so a door holder with a live grant cannot use the same session to
   render any other Bridge screen's shell. The page itself re-checks the
   grant against the episode; this header opens nothing on its own.

   Exact path, not a prefix: /bridge/gangway has no children, and a prefix
   would name a route that does not exist yet as a door route. */
export const DOOR_HEADER = "x-un-door";
const DOOR_PATH = "/bridge/gangway";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  /* The request headers the route will see. A client can send x-un-door
     itself, so it is stripped on every request and set again only where the
     proxy decided it belongs — the header is the proxy's word, never the
     caller's. Built fresh each time, AFTER the cookie refresh below may have
     rewritten the request's cookies, so the refreshed session travels with it. */
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.delete(DOOR_HEADER);
    if (path === DOOR_PATH) headers.set(DOOR_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  };

  let supabaseResponse = forward();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getUser() — session refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/gangway";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
