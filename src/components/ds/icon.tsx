import React from "react";
import { icons } from "lucide-react";

/* Lucide glyph wrapper — the brand has no proprietary icon font; hand-drawn
   SVGs are banned. Names are Lucide PascalCase ("Anchor", "CalendarDays"). */
export function Icon({
  name, size = 18, strokeWidth = 1.75, label, style, className,
}: {
  name: string; size?: number; strokeWidth?: number; label?: string;
  style?: React.CSSProperties; className?: string;
}) {
  const Cmp = icons[name as keyof typeof icons];
  if (!Cmp) {
    return <span aria-hidden="true" style={{ display: "inline-block", width: size, height: size, ...style }} className={className}></span>;
  }
  return (
    <Cmp
      width={size} height={size} strokeWidth={strokeWidth}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ flex: "none", ...style }} className={className}
    />
  );
}
