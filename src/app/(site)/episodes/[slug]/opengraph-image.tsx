import { ImageResponse } from "next/og";
import { ANCHOR, CITY_CODES, SETTING_LABEL, SUB_CLASSES } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

export const alt = `An episode from ${ANCHOR}.`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  /* Only what the card draws — the anonymous grant refuses a "*" read whole
     (src/lib/episode-columns.ts). */
  const { data: episode } = await supabase
    .from("episodes")
    .select("title, blurb, city_id, setting, starts_at, sub_class, time_zone")
    .eq("slug", slug)
    .maybeSingle();

  if (!episode) {
    return new ImageResponse(
      (
        <OgFrame
          eyebrow="EPISODES"
          title="Episodes."
          meta="AFLOAT · ASHORE · PASSES ARE FEW BY DESIGN"
        />
      ),
      { ...size }
    );
  }

  const { data: city } = episode.city_id
    ? await supabase.from("cities").select("slug").eq("id", episode.city_id).maybeSingle()
    : { data: null };

  const setting = SETTING_LABEL[episode.setting] ?? SETTING_LABEL.sea;
  const sub = episode.sub_class ? SUB_CLASSES[episode.sub_class] : null;
  const meta = [
    setting,
    sub?.label,
    logDate(episode.starts_at, episode.time_zone),
    city?.slug ? CITY_CODES[city.slug] : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={setting.toUpperCase()}
        title={episode.title}
        standfirst={episode.blurb}
        meta={meta}
      />
    ),
    { ...size }
  );
}
