import { ImageResponse } from "next/og";
import { ANCHOR, CITY_CODES, TAGLINE } from "@/lib/brand";
import { OG_CONTENT_TYPE, OG_SIZE, OgFrame } from "@/components/site/og-frame";

export const alt = `${ANCHOR} ${TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/* The meta line carried two of the retired taxonomy words from BANNED_TERMS,
   set in caps. Neither gate could ever have caught them: this route rasterises
   to a PNG and both suites grep visible HTML, so the club's own share card is
   structurally invisible to the lexicon audit. Nothing stops the next retired
   word landing here either, so the line now carries only facts a query can
   settle — five series, 52 episodes in Season I, and the two cities open. */
export default function Image() {
  return new ImageResponse(
    (
      <OgFrame
        eyebrow="THE SOCIAL CLUB, UNSCRIPTED"
        title={TAGLINE}
        standfirst="Fifty-two episodes a season, afloat and ashore. No scripts. No second takes."
        meta={`FIVE SERIES · 52 EPISODES · ${CITY_CODES.miami} · ${CITY_CODES["los-angeles"]}`}
      />
    ),
    { ...size }
  );
}
