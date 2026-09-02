import { ImageResponse } from "next/og";
import { ANCHOR, CLUB_ZONE, SURFACES } from "@/lib/brand";
import { logDate, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

export const alt = `A dispatch from the ${ANCHOR} log.`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("dispatch_posts")
    .select("title, dek, tag, published_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!post) {
    return new ImageResponse(
      (
        <OgFrame
          eyebrow={SURFACES.magazine}
          title="The ship's log, published."
          meta={`${SURFACES.magazine} · THE CLUB MAGAZINE`}
        />
      ),
      { ...size }
    );
  }

  const meta = [
    SURFACES.magazine,
    post.tag,
    logDate(post.published_at, CLUB_ZONE),
    roman(new Date(post.published_at).getFullYear()),
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={SURFACES.magazine}
        title={post.title}
        standfirst={post.dek}
        meta={meta}
      />
    ),
    { ...size }
  );
}
