import { SITE_DOMAIN } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import {
  buildCalendar,
  icsResponse,
  voyageLocation,
  voyageSummary,
  voyageWindow,
  type CalendarEvent,
} from "../ics";

/* GET /api/calendar/[token] — a member's season, public by secret.
   The caller is unauthenticated by design (calendar apps carry no cookies),
   so the token on the profile is the whole of the authorisation. The
   `calendar_feed` definer RPC scopes the read to that token and nothing
   else, so no service-role key rides on a public route. Unknown token
   yields no rows, and no rows is a 404 — no hints either way. */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!UUID.test(token)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("calendar_feed", { p_token: token });
  if (!rows || rows.length === 0) return new Response("Not found", { status: 404 });

  const events: CalendarEvent[] = rows.map((row) => {
    const { start, end } = voyageWindow(row);
    const description = [
      row.blurb ?? "",
      row.boarding_code ? `Boarding code ${row.boarding_code}.` : "",
      row.guests > 0 ? `${row.guests} guest${row.guests === 1 ? "" : "s"} on your pass.` : "",
      "Boards thirty minutes before cast off.",
      `${SITE_URL}/voyages/${row.slug}`,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      uid: `${row.rsvp_id}@${SITE_DOMAIN}`,
      start,
      end,
      summary: voyageSummary(row),
      location: voyageLocation(row),
      description,
      url: `${SITE_URL}/voyages/${row.slug}`,
      alarm: `${row.title} — boards tomorrow.`,
    };
  });

  /* No name on the feed: the token is unauthenticated, so it carries the
     season and nothing that identifies whose season it is. */
  return icsResponse(buildCalendar("LYRE SOCIAL — your season", events), "lyre-social.ics");
}
