import { ImageResponse } from "next/og";
import { ANCHOR } from "@/lib/brand";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

/* The card a shared /season link unfurls into. Text only, in the club's own
   register, and deliberately reading nothing: the page behind it is a member's
   own record, and a preview fetched by a chat app carries no session. No name,
   no number, no face — the numbers are for the member who signed in. */
export const alt = `A season, on the record — ${ANCHOR}.`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame
        eyebrow="THE SEASON, ON THE RECORD"
        title="Season."
        standfirst="Episodes aboard, miles logged, cities, hulls, crew met, marks earned. Miles, not likes."
        meta="ONE MEMBER · ONE SEASON · THE PASSAGE LOG"
      />
    ),
    { ...size }
  );
}
