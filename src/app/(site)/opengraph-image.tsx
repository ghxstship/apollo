import { ImageResponse } from "next/og";
import { CITY_CODES, TAGLINE } from "@/lib/brand";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

export const alt = "[UN] — anything goes here";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame
        eyebrow="THE SOCIAL CLUB FOR SEA AND SHORE"
        title={TAGLINE}
        standfirst="Sea Days on the water. Port Days ashore. A crew worth the crossing."
        meta={`SEA DAY · PORT DAY · ${CITY_CODES.miami} · ${CITY_CODES["los-angeles"]}`}
      />
    ),
    { ...size }
  );
}
