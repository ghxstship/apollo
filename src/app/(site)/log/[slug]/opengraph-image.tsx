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
    .from("log_posts")
    .select("title, dek, tag, published_at")
    .eq("slug", slug)
    .maybeSingle();

  /* The fallback card's meta line named a noun the vocabulary does not carry
     and repeated the eyebrow directly above it, and its title was the boat
     metaphor the Log itself has now dropped. The Log's own line does both
     jobs. */
  if (!post) {
    return new ImageResponse(
      (
        <OgFrame
          eyebrow={SURFACES.magazine}
          title="What actually happened."
          meta={`${SURFACES.magazine} · SEASON I`}
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
