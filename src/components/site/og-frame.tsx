import React from "react";
import { ANCHOR } from "@/lib/brand";

/* Shared card for the social previews — ink ground, ivory type, the anchor
   tracked wide, one flat rule as the view's only accent. Rendered by next/og
   (satori), so every box declares display and no font is fetched.

   The literals below are the one place in src that may hold raw hex. next/og
   rasterises on the server with no document and no cascade, so var(--noir-900)
   resolves to nothing and the card renders transparent-on-transparent. Each value
   is copied from the palette and has to be re-copied when the palette moves. */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#141414";        /* --noir-900 */
const IVORY = "#F1F1ED";      /* --ivory-100 — and, on this ink ground, --accent */
/* --text-faint on the ink theme. Was #8A8A85, the PAPER step, and the value the
   palette pass replaced for failing AA in both themes: at 3.59:1 on this ground
   it was the eyebrow, the standfirst and the meta line of every social preview
   the club publishes. #8E8E88 measures 5.59:1. */
const MUTED = "#8E8E88";
/* Was a three-stop linear-gradient across --acid-600/400/600 — a gradient whose
   outer stops were the same colour, so it rasterised as a two-tone smear for no
   reason anyone could see. The accent has no hue at all now, and on ink it is
   ivory, which makes this what it always effectively was: a flat rule. A
   backgroundColor, not a backgroundImage. */
const RULE = IVORY;

export function OgFrame({
  eyebrow,
  title,
  standfirst,
  meta,
}: {
  eyebrow: string;
  title: string;
  standfirst?: string | null;
  meta: string;
}) {
  const titleSize = title.length > 46 ? 54 : title.length > 28 ? 64 : 76;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: INK,
        color: IVORY,
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 8, backgroundColor: RULE }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "space-between",
          padding: "60px 72px 56px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "var(--text-xl)", letterSpacing: 15 }}>{ANCHOR}</div>
          <div
            style={{ display: "flex", fontSize: "var(--text-lg)", letterSpacing: 6, color: MUTED, marginTop: 18 }}
          >
            {eyebrow}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div style={{ display: "flex", fontSize: titleSize, lineHeight: 1.12 }}>{title}</div>
          {standfirst ? (
            <div
              style={{
                display: "flex",
                fontSize: "var(--text-xl)",
                lineHeight: 1.4,
                color: MUTED,
                marginTop: 22,
              }}
            >
              {standfirst}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: "var(--text-lg)", letterSpacing: 5, color: MUTED }}>{meta}</div>
      </div>
    </div>
  );
}
