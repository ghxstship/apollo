import { ImageResponse } from "next/og";
import { SETTING_LABEL } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { createClient } from "@/lib/supabase/server";
import { SHARE_SIZES, ShareFrame, type ShareRatio } from "@/components/site/og-frame";

/* GET /episodes/[slug]/share — a portrait card a member posts to a story
   (default, 1080×1920) or a feed (?ratio=4x5, 1080×1350). Built on the
   episode's public facts only: series, title, city, date and whether the door
   is open. No venue, no address, no faces — the same line the page holds for
   anyone without a pass. Modelled on opengraph-image.tsx: satori has no
   cascade, so every colour and size is a literal inside og-frame.tsx. */

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return new Response("Off the chart.\n", { status: 404 });

  const ratioParam = new URL(request.url).searchParams.get("ratio");
  const ratio: ShareRatio = ratioParam === "4x5" ? "4x5" : "9x16";
  const size = SHARE_SIZES[ratio];

  const supabase = await createClient();
  const { data: episode } = await supabase
    .from("episodes")
    .select("id, title, setting, series, city_id, starts_at, time_zone, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!episode) return new Response("Off the chart.\n", { status: 404 });

  const [{ data: city }, { data: cap }, { data: seriesRow }] = await Promise.all([
    episode.city_id
      ? supabase.from("cities").select("name").eq("id", episode.city_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("episode_capacity").select("passes_left").eq("episode_id", episode.id).maybeSingle(),
    episode.series
      ? moduleTables(supabase).from("series").select("label").eq("slug", episode.series).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const series = (seriesRow ?? null) as { label: string } | null;

  /* The door, from capacity — and from the calendar, because Now casting on
     an episode that has run would be a lie the card carries for years. */
  const nowMs = Date.now();
  const cancelled = episode.status === "cancelled";
  const sailed = !cancelled && (episode.status === "completed" || Date.parse(episode.starts_at) < nowMs);
  const slate = cancelled
    ? "Cancelled"
    : sailed
      ? "Wrapped"
      : (cap?.passes_left ?? null) === 0
        ? "Sold out"
        : "Now casting";

  return new ImageResponse(
    (
      <ShareFrame
        eyebrow={series?.label ?? SETTING_LABEL[episode.setting] ?? SETTING_LABEL.sea}
        title={episode.title}
        city={city?.name ?? null}
        date={logDate(episode.starts_at, episode.time_zone)}
        slate={slate}
        ratio={ratio}
      />
    ),
    {
      ...size,
      headers: {
        /* A card is fetched to be posted; the page it came from is the thing
           to index. */
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
