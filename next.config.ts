import type { NextConfig } from "next";
import path from "node:path";

/* Content-Security-Policy.

   Next inlines a bootstrap script and streams RSC payloads through inline
   script tags, so 'unsafe-inline' on script-src is unavoidable without a nonce
   pipeline; everything else is closed. connect-src has to reach Supabase for
   PostgREST, auth, realtime and storage — including the wss:// origin, which
   is the same host over a different scheme. img-src takes blob: and data:
   because signed frames and the QR on a boarding pass are generated in the
   page. */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS} https://api.stripe.com`,
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  /* The version of the framework is not the visitor's business. */
  poweredByHeader: false,

  /* Skew handling in Next 16 is entirely gated on this being set: with it,
     assets carry ?dpl= and navigations carry x-deployment-id, and a mismatch
     forces a hard reload. Without it the documented failure modes are missing
     assets, Server Function mismatches — a client posting an action id the new
     build no longer knows — and failed navigations. A member with a tab open
     across a deploy hits all three.

     Read from the host rather than hardcoded; undefined when it is absent, so
     a local build behaves exactly as it did. */
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || undefined,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          /* Boarding stubs, signing links and calendar feeds carry their
             credential in the path. A full referrer would hand that token to
             whatever a member clicks through to next. */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            /* camera=(self), not camera=(). The empty list disables the feature
               for EVERY origin including our own, and the Gangway's QR scanner
               is our own — it fell straight through to "The camera declined.
               Check permissions, or type the code.", turning every check-in on
               the dock into manual typing. */
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        source: "/api/calendar/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        /* A signing link or a boarding stub must never leak its own URL, not
           even the origin, and must never be cached by anything in between. */
        /* Every path that carries its credential in the URL. The calendar feed
           was missing from this list, so a bearer-token URL kept the default
           referrer policy and stayed cacheable. */
        source: "/:path(sign|stub|kiosk|w)/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },

  // Two lockfiles live in this repo (Apollo root + this app); pin the root so
  // Turbopack doesn't resolve modules against the wrong workspace.
  turbopack: {
    root: path.join(__dirname),
  },
  // 2026-08 [un] rebrand: the [un]-era paths move permanently.
  async redirects() {
    return [
      { source: "/home-port", destination: "/home", permanent: true },
      { source: "/gateway", destination: "/live", permanent: true },
      { source: "/booth", destination: "/open-deck", permanent: true },
      { source: "/passbook", destination: "/card", permanent: true },
      /* Two dead names for the shop, and BOTH have to be answered.
         /chandlery was pointed at /slop-chest, and then /slop-chest was renamed
         to /shop — so the redirect landed on a 404. Worse, `permanent: true`
         emits a 308 that browsers may cache indefinitely, so everyone who has
         already followed /chandlery has "/chandlery -> /slop-chest" pinned
         locally: repointing /chandlery alone does not reach them. Only a
         /slop-chest entry does. */
      { source: "/chandlery", destination: "/shop", permanent: true },
      { source: "/slop-chest", destination: "/shop", permanent: true },
      { source: "/word", destination: "/inbox", permanent: true },
      /* 2026-09 episode rename. Every event is an episode — the show's own word
         — so the event listing takes /episodes, and the written record moves to
         /log, which is what its standfirst always called it.

         Order matters here and is load-bearing. The four editorial slugs are
         redirected BY NAME, before the wildcards, because /episodes/:slug is
         now an event address: a blanket /episodes/:path* -> /log/:path* would
         shadow every episode on the manifest. Only these four ever lived at the
         old address, so naming them is both exact and finite. */
      { source: "/episodes/season-two-manifest", destination: "/log/season-two-manifest", permanent: true },
      { source: "/episodes/passes-are-few-by-design", destination: "/log/passes-are-few-by-design", permanent: true },
      { source: "/episodes/what-the-wind-writes", destination: "/log/what-the-wind-writes", permanent: true },
      { source: "/episodes/the-knot-standard", destination: "/log/the-knot-standard", permanent: true },
      /* 2026-09 route/name alignment. Every surface answers to one name, and
         the route is that name — a member cannot learn a name the product will
         not use twice in a row. Four member routes moved to the word already on
         their own heading. */
      { source: "/manifest", destination: "/passes", permanent: true },
      { source: "/manifest/:path*", destination: "/passes/:path*", permanent: true },
      { source: "/charter", destination: "/itinerary", permanent: true },
      { source: "/charter/:path*", destination: "/itinerary/:path*", permanent: true },
      { source: "/tables", destination: "/tonight", permanent: true },
      { source: "/tables/:path*", destination: "/tonight/:path*", permanent: true },
      /* The console tab moved for the same reason the member page did: Tables
         is never a route. The object is still a table — that noun means the
         blind dinner for six and nothing else — but the surface answers to the
         night it lays them for, and to the same word the member sees. */
      { source: "/bridge/tables", destination: "/bridge/tonight", permanent: true },
      /* The catalogue of named recurring episode kinds has had three addresses
         in two weeks and every one of them is a 308 somebody's browser has
         pinned. /activity was the original; /experiences was a stopgap that
         only ever lived in an unreleased build; /series is the name, because
         Format was a back-of-house word and Series is the one a viewer owns.

         Both old names have to be answered, and /activity must point at the
         CURRENT name rather than at /experiences — a redirect that lands on a
         redirect is fine for a browser and fatal for anyone who already
         cached the first hop. */
      { source: "/activity", destination: "/series", permanent: true },
      { source: "/activity/:path*", destination: "/series/:path*", permanent: true },
      { source: "/experiences", destination: "/series", permanent: true },
      { source: "/experiences/:path*", destination: "/series/:path*", permanent: true },
      { source: "/charters", destination: "/episodes", permanent: true },
      { source: "/charters/:path*", destination: "/episodes/:path*", permanent: true },
      { source: "/voyages", destination: "/episodes", permanent: true },
      { source: "/voyages/:path*", destination: "/episodes/:path*", permanent: true },
      { source: "/lore", destination: "/log", permanent: true },
      { source: "/lore/:path*", destination: "/log/:path*", permanent: true },
      /* The ledger's currency was renamed; this article's address had not been. */
      {
        source: "/episodes/the-fathom-standard",
        destination: "/log/the-knot-standard",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
