import type { MetadataRoute } from "next";
import manifest from "@/lib/route-manifest.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Member surfaces stay off the charts — derived from the same
      // protected list the auth proxy enforces.
      disallow: [...manifest.protectedPrefixes.map((p) => p + "/"), ...manifest.protectedPrefixes, "/auth/"],
    },
    sitemap: SITE_URL + "/sitemap.xml",
  };
}
