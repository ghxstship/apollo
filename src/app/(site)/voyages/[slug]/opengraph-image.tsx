import { ImageResponse } from "next/og";
import { CITY_CODES, FAMILY_LABEL, SUB_CLASSES } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

export const alt = "A voyage on the LYRE SOCIAL manifest.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: voyage } = await supabase
    .from("voyages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!voyage) {
    return new ImageResponse(
      (
        <OgFrame
          eyebrow="THE MANIFEST"
          title="Voyages."
          meta="SEA DAY · PORT DAY · PASSES ARE FEW BY DESIGN"
        />
      ),
      { ...size }
    );
  }

  const { data: harbor } = voyage.harbor_id
    ? await supabase.from("harbors").select("slug").eq("id", voyage.harbor_id).maybeSingle()
    : { data: null };

  const family = FAMILY_LABEL[voyage.class] ?? FAMILY_LABEL.sea;
  const sub = voyage.sub_class ? SUB_CLASSES[voyage.sub_class] : null;
  const meta = [
    family,
    sub?.label,
    logDate(voyage.starts_at),
    harbor?.slug ? CITY_CODES[harbor.slug] : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return new ImageResponse(
    (
      <OgFrame
        eyebrow={family.toUpperCase()}
        title={voyage.title}
        standfirst={voyage.blurb}
        meta={meta}
      />
    ),
    { ...size }
  );
}
