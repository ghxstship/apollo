import React from "react";

/* Shared card for the social previews — carbon ground, paper type, the
   wordmark tracked wide, one gold rule as the view's only accent. Rendered by
   next/og (satori), so every box declares display and no font is fetched. */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const CARBON = "#101418";
const PAPER = "#F4EFE6";
const MUTED = "#7E8894";
const GOLD_RULE = "linear-gradient(90deg,#966E22,#D3B15E,#966E22)";

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
        backgroundColor: CARBON,
        color: PAPER,
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 8, backgroundImage: GOLD_RULE }} />
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
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 15 }}>SYRIUS SOCIAL</div>
          <div
            style={{ display: "flex", fontSize: 17, letterSpacing: 6, color: MUTED, marginTop: 18 }}
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
                fontSize: 24,
                lineHeight: 1.4,
                color: MUTED,
                marginTop: 22,
              }}
            >
              {standfirst}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 19, letterSpacing: 5, color: MUTED }}>{meta}</div>
      </div>
    </div>
  );
}
