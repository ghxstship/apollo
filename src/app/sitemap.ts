import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import manifest from "@/lib/route-manifest.json";
import { SITE_DOMAIN } from "@/lib/brand";
import { readSeries } from "@/app/(site)/series/data";

/* Public sitemap, derived from the generated route manifest (static pages)
   plus live Supabase slugs (dynamic pages). Member and auth surfaces are
   deliberately absent — they sit behind the gangway. */

export const revalidate = 3600;

/* Never localhost as the fallback: these two files are what search engines
   and social cards read, and a production deploy without the env var was
   publishing http://localhost:3000 URLs while og:image on the same page said
   https://unhingedsocial.us. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/episodes": 0.9,
  "/membership": 0.9,
  "/log": 0.7,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = manifest.routes
    .filter((r) => r.access === "public" && r.type === "page" && !r.dynamic)
    .map((r) => ({
      url: SITE_URL + (r.path === "/" ? "" : r.path),
      lastModified: now,
      changeFrequency: r.path === "/" || r.path === "/episodes" ? "daily" : "weekly",
      priority: PRIORITY[r.path] ?? 0.5,
    }));

  const supabase = await createClient();
  const [{ data: episodes }, { data: posts }, series, { data: crew }, { data: roles }] = await Promise.all([
    /* The listing shows scheduled/live/held episodes; the sitemap used to
       publish every row, which put E2E fixtures and cancelled episodes in front
       of search engines. One rule, both places. */
    supabase
      .from("episodes")
      .select("slug, created_at")
      .in("status", ["scheduled", "live", "weather_hold", "completed"]),
    supabase.from("log_posts").select("slug, published_at"),
    /* The three public dynamic segments the sitemap did not know about. Each
       reads exactly the rows its page will render rather than 404: an active
       series (readOneSeries asks for active), a crew member who opted in, and
       an open posting — a closed one still renders, but as a closed door. */
    readSeries(supabase),
    supabase.from("crew").select("slug").eq("public", true).eq("active", true),
    supabase.from("crew_roles").select("slug").eq("open", true),
  ]);

  const episodeEntries: MetadataRoute.Sitemap = (episodes ?? []).map((v) => ({
    url: `${SITE_URL}/episodes/${v.slug}`,
    lastModified: new Date(v.created_at),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const logEntries: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/log/${p.slug}`,
    lastModified: new Date(p.published_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const seriesEntries: MetadataRoute.Sitemap = series.map((s) => ({
    url: `${SITE_URL}/series/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const crewEntries: MetadataRoute.Sitemap = (crew ?? []).map((c) => ({
    url: `${SITE_URL}/crew/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  const roleEntries: MetadataRoute.Sitemap = (roles ?? []).map((r) => ({
    url: `${SITE_URL}/crew/wanted/${r.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticEntries, ...episodeEntries, ...logEntries, ...seriesEntries, ...crewEntries, ...roleEntries];
}
