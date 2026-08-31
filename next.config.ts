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
        source: "/:path(sign|stub|kiosk)/:token*",
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
  // 2026-08 Syrius rebrand: the Lyre-era paths move permanently.
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
      { source: "/voyages", destination: "/charters", permanent: true },
      { source: "/voyages/:path*", destination: "/charters/:path*", permanent: true },
      { source: "/lore", destination: "/episodes", permanent: true },
      { source: "/lore/:path*", destination: "/episodes/:path*", permanent: true },
      /* The ledger's currency was renamed; this article's address had not been. */
      {
        source: "/episodes/the-fathom-standard",
        destination: "/episodes/the-knot-standard",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
