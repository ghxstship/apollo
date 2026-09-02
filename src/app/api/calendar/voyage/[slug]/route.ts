import { SITE_DOMAIN } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import {
  buildCalendar,
  icsResponse,
  voyageLocation,
  voyageSummary,
  voyageWindow, icsStatus } from "../../ics";

/* GET /api/calendar/voyage/[slug] — one public episode, no sign-in.
   The path segment is legacy plumbing, like the table it reads. The same row
   the episode page already shows the shore, in a form a calendar will hold
   onto. */

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: voyage } = await supabase
    .from("voyages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!voyage) return new Response("Not found", { status: 404 });

  const { start, end } = voyageWindow(voyage);
  const url = `${SITE_URL}/episodes/${voyage.slug}`;
  const description = [
    voyage.blurb ?? "",
    "Boards thirty minutes before cast off.",
    "Weather holds are called by 18:00 the night before.",
    url,
  ]
    .filter(Boolean)
    .join("\n");

  const body = buildCalendar(voyage.title, [
    {
      uid: `voyage-${voyage.id}@${SITE_DOMAIN}`,
      start,
      end,
      summary: voyageSummary(voyage),
      location: voyageLocation(voyage),
      description,
      url,
      alarm: `${voyage.title} — tomorrow. Boards thirty minutes before cast off.`,
      status: icsStatus(voyage.status),
    },
  ]);

  return icsResponse(body, `${voyage.slug}.ics`);
}
