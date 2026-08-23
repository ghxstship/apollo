import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import manifest from "@/lib/route-manifest.json";
import { SITE_DOMAIN } from "@/lib/brand";

/* Public sitemap, derived from the generated route manifest (static pages)
   plus live Supabase slugs (dynamic pages). Member and auth surfaces are
   deliberately absent — they sit behind the gangway. */

export const revalidate = 3600;

/* Never localhost as the fallback: these two files are what search engines
   and social cards read, and a production deploy without the env var was
   publishing http://localhost:3000 URLs while og:image on the same page said
   https://syrius.social. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/charters": 0.9,
  "/membership": 0.9,
  "/episodes": 0.7,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = manifest.routes
    .filter((r) => r.access === "public" && r.type === "page" && !r.dynamic)
    .map((r) => ({
      url: SITE_URL + (r.path === "/" ? "" : r.path),
      lastModified: now,
      changeFrequency: r.path === "/" || r.path === "/charters" ? "daily" : "weekly",
      priority: PRIORITY[r.path] ?? 0.5,
    }));

  const supabase = await createClient();
  const [{ data: voyages }, { data: posts }] = await Promise.all([
    /* The listing shows scheduled/live/held sailings; the sitemap used to
       publish every row, which put E2E fixtures and cancelled voyages in front
       of search engines. One rule, both places. */
    supabase
      .from("voyages")
      .select("slug, created_at")
      .in("status", ["scheduled", "live", "weather_hold", "completed"]),
    supabase.from("dispatch_posts").select("slug, published_at"),
  ]);

  const voyageEntries: MetadataRoute.Sitemap = (voyages ?? []).map((v) => ({
    url: `${SITE_URL}/charters/${v.slug}`,
    lastModified: new Date(v.created_at),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const dispatchEntries: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/episodes/${p.slug}`,
    lastModified: new Date(p.published_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...voyageEntries, ...dispatchEntries];
}
