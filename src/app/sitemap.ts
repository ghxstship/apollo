import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import manifest from "@/lib/route-manifest.json";

/* Public sitemap, derived from the generated route manifest (static pages)
   plus live Supabase slugs (dynamic pages). Member and auth surfaces are
   deliberately absent — they sit behind the gangway. */

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/voyages": 0.9,
  "/membership": 0.9,
  "/lore": 0.7,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = manifest.routes
    .filter((r) => r.access === "public" && r.type === "page" && !r.dynamic)
    .map((r) => ({
      url: SITE_URL + (r.path === "/" ? "" : r.path),
      lastModified: now,
      changeFrequency: r.path === "/" || r.path === "/voyages" ? "daily" : "weekly",
      priority: PRIORITY[r.path] ?? 0.5,
    }));

  const supabase = await createClient();
  const [{ data: voyages }, { data: posts }] = await Promise.all([
    supabase.from("voyages").select("slug, created_at"),
    supabase.from("dispatch_posts").select("slug, published_at"),
  ]);

  const voyageEntries: MetadataRoute.Sitemap = (voyages ?? []).map((v) => ({
    url: `${SITE_URL}/voyages/${v.slug}`,
    lastModified: new Date(v.created_at),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const dispatchEntries: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/lore/${p.slug}`,
    lastModified: new Date(p.published_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...voyageEntries, ...dispatchEntries];
}
