import React from "react";
import { ANCHOR } from "@/lib/brand";

/* Shared card for the social previews — ink ground, ivory type, the anchor
   tracked wide, one acid rule as the view's only accent. Rendered by next/og
   (satori), so every box declares display and no font is fetched.

   The five literals below are the one place in src that may hold raw hex. next/og
   rasterises on the server with no document and no cascade, so var(--noir-900)
   resolves to nothing and the card renders transparent-on-transparent. Each value
   is copied from tokens.css and has to be re-copied when tokens.css moves. */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#141414";        /* --noir-900 */
const IVORY = "#F1F1ED";      /* --ivory-100 */
const MUTED = "#8A8A85";      /* --text-faint */
const ACID_RULE = "linear-gradient(90deg,#2F9410,#58D621,#2F9410)"; /* --acid-600/400/600 */

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
      <div style={{ display: "flex", width: "100%", height: 8, backgroundImage: ACID_RULE }} />
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
