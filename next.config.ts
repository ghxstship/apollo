import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
      { source: "/chandlery", destination: "/slop-chest", permanent: true },
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
