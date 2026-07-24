import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Two lockfiles live in this repo (Apollo root + this app); pin the root so
  // Turbopack doesn't resolve modules against the wrong workspace.
  turbopack: {
    root: path.join(__dirname),
  },
  // 2026-07 rebrand: permanent moves to the new surface names.
  async redirects() {
    return [
      { source: "/harbor", destination: "/home-port", permanent: true },
      { source: "/wardroom", destination: "/open-deck", permanent: true },
      { source: "/now", destination: "/gateway", permanent: true },
      { source: "/card", destination: "/passbook", permanent: true },
      { source: "/harbormaster", destination: "/bridge", permanent: true },
      { source: "/harbormaster/:path*", destination: "/bridge/:path*", permanent: true },
      { source: "/dispatch", destination: "/lore", permanent: true },
      { source: "/dispatch/:path*", destination: "/lore/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
