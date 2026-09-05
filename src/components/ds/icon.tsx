import React from "react";
import { ICONS } from "./icon-set";

/* Lucide glyph wrapper — the brand has no proprietary icon font; hand-drawn
   SVGs are banned. Names are Lucide PascalCase ("Anchor", "CalendarDays").

   A name Lucide does not export renders as an empty box of the requested size,
   so the layout holds — but it holds around nothing, and nothing says so. The
   agreements page asked for "FileSignature", which Lucide 1.x does not ship,
   and the empty state drew a blank 26px square above its title for weeks. So:
   a one-time console warning in development, and `check:ds` (the `icons`
   gate) reads every literal name in src/ against the set. */
const warned = new Set<string>();

export function Icon({
  name, size = 18, strokeWidth = 1.75, label, style, className,
}: {
  /** Lucide PascalCase name. */
  name: string;
  size?: number;
  strokeWidth?: number;
  /** Accessible name. Omit for a decorative glyph beside its own text — the
      icon is then aria-hidden. */
  label?: string;
  style?: React.CSSProperties; className?: string;
}) {
  const Cmp = ICONS[name as keyof typeof ICONS];
  if (!Cmp) {
    if (process.env.NODE_ENV !== "production" && !warned.has(name)) {
      warned.add(name);
      console.warn(`[un] Icon: "${name}" is not a Lucide icon name; rendering an empty ${size}px box.`);
    }
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
