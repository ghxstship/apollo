import { SITE_DOMAIN } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import {
  buildCalendar,
  icsResponse,
  offTheChart,
  voyageLocation,
  voyageSummary,
  voyageWindow, icsStatus } from "../../ics";

/* GET /api/calendar/episode/[slug] — one public episode, no sign-in.
   The path segment is legacy plumbing, like the table it reads. The same row
   the episode page already shows the shore, in a form a calendar will hold
   onto. */

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

/* What a slug is. Anything else never was an address, so it is refused
   before the database is asked — and the slug goes on into a filename, so
   this is also what keeps that header a header. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return offTheChart();

  const supabase = await createClient();
  /* Only the columns the calendar carries. The episode row also holds what
     the club keeps to itself — pricing tiers, capacity, internal notes — and
     a feed that selects * ships every future column too. */
  const { data: episode } = await supabase
    .from("episodes")
    .select("id,slug,title,setting,blurb,starts_at,ends_at,coordinates,muster,status")
    .eq("slug", slug)
    .maybeSingle();
  if (!episode) return offTheChart();

  const { start, end } = voyageWindow(episode);
  const url = `${SITE_URL}/episodes/${episode.slug}`;
  const description = [
    episode.blurb ?? "",
    "Boards thirty minutes before cast off.",
    "Weather holds are called by 18:00 the night before.",
    url,
  ]
    .filter(Boolean)
    .join("\n");

  const body = buildCalendar(episode.title, [
    {
      uid: `episode-${episode.id}@${SITE_DOMAIN}`,
      start,
      end,
      summary: voyageSummary(episode),
      location: voyageLocation(episode),
      description,
      url,
      alarm: `${episode.title} — tomorrow. Boards thirty minutes before cast off.`,
      status: icsStatus(episode.status),
    },
  ]);

  return icsResponse(body, `${episode.slug}.ics`);
}
