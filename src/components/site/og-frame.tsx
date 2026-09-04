import React from "react";
import { ANCHOR } from "@/lib/brand";

/* Shared card for the social previews — ink ground, ivory type, the anchor
   tracked wide, one flat rule as the view's only accent. Rendered by next/og
   (satori), so every box declares display and no font is fetched.

   The literals below are the one place in src that may hold raw hex. next/og
   rasterises on the server with no document and no cascade, so var(--noir-900)
   resolves to nothing and the card renders transparent-on-transparent. Each value
   is copied from the palette and has to be re-copied when the palette moves.

   The same goes for type sizes: fontSize: "var(--text-xl)" is not a size to
   satori, it is an unparseable string, and the eyebrow, standfirst and meta
   line fell back to the engine's default. The numbers below are the ladder's
   own --text-xl (22) and --text-lg (18), transcribed for the same reason. */

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
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 15 }}>{ANCHOR}</div>
          <div
            style={{ display: "flex", fontSize: 18, letterSpacing: 6, color: MUTED, marginTop: 18 }}
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
                fontSize: 22,
                lineHeight: 1.4,
                color: MUTED,
                marginTop: 22,
              }}
            >
              {standfirst}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 18, letterSpacing: 5, color: MUTED }}>{meta}</div>
      </div>
    </div>
  );
}

/* ── The share card ───────────────────────────────────────────────────────────
   A portrait slate for a story (1080×1920) or a post (1080×1350), in the same
   register as the preview above: ink ground, ivory type, the anchor tracked
   wide, one flat rule. No faces, no address — the series, the title, the city
   and the date, and one word for the door. Rendered by the same engine, so
   the same literals and the same px-only sizes, and the same exemption. */

export const SHARE_SIZES = {
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
} as const;
export type ShareRatio = keyof typeof SHARE_SIZES;

export function ShareFrame({
  eyebrow,
  title,
  city,
  date,
  slate,
  ratio,
}: {
  eyebrow: string;
  title: string;
  city: string | null;
  date: string;
  /* The door, in the show's word order: NOW CASTING · SOLD OUT · WRAPPED. */
  slate: string;
  ratio: ShareRatio;
}) {
  const tall = ratio === "9x16";
  const titleSize = title.length > 40 ? 84 : title.length > 24 ? 104 : 128;
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
      <div style={{ display: "flex", width: "100%", height: 14, backgroundColor: RULE }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "space-between",
          padding: tall ? "160px 96px 140px" : "96px 96px 88px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 36, letterSpacing: 26 }}>{ANCHOR}</div>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 10, color: MUTED, marginTop: 34 }}>
            {eyebrow.toUpperCase()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: titleSize, lineHeight: 1.04, textTransform: "uppercase" }}>
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 36,
              letterSpacing: 8,
              color: MUTED,
              marginTop: 48,
              textTransform: "uppercase",
            }}
          >
            {[city, date].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 120, height: 6, backgroundColor: RULE, marginBottom: 40 }} />
          <div style={{ display: "flex", fontSize: 48, letterSpacing: 14, textTransform: "uppercase" }}>{slate}</div>
        </div>
      </div>
    </div>
  );
}
