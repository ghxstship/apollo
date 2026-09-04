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
const PROTECTED = ["/home", "/passes", "/itinerary", "/membership/standing", "/open-deck", "/directory", "/threads", "/portal", "/account", "/card", "/inbox", "/you", "/live", "/shop", "/stub", "/regattas", "/tonight", "/matches", "/agreements", "/kiosk", "/bridge", "/vetting", "/radar", "/show"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/gangway";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
