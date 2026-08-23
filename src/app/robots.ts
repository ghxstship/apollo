import type { MetadataRoute } from "next";
import manifest from "@/lib/route-manifest.json";
import { SITE_DOMAIN } from "@/lib/brand";

/* Never localhost as the fallback: these two files are what search engines
   and social cards read, and a production deploy without the env var was
   publishing http://localhost:3000 URLs while og:image on the same page said
   https://syrius.social. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

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
