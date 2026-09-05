import React from "react";
import { ICONS, type IconName, type IconSize } from "./icon-set";

/* Lucide glyph wrapper — the brand has no proprietary icon font; hand-drawn
   SVGs are banned. Names are Lucide PascalCase ("Anchor", "CalendarDays").

   A name Lucide does not export renders as an empty box of the requested size,
   so the layout holds — but it holds around nothing, and nothing says so. The
   agreements page asked for "FileSignature", which Lucide 1.x does not ship,
   and the empty state drew a blank 26px square above its title for weeks.

   `name` is the SET's own union now, so that page would not have compiled.
   The two defences that were carrying this on their own stay where they are:
   the one-time development warning below, and the `icons` gate in check:ds,
   which reads every literal name in src/ — including the ones in a Record or
   a data table, where the union has nothing to check against. The type should
   make the warning unreachable; if it ever fires, something is casting. */
const warned = new Set<string>();

export interface IconProps {
  /** Lucide PascalCase name, from the set icon-set.ts ships. */
  name: IconName;
  /** A rung on the icon ladder, or a bare number where a glyph is sized to
      something else on the page (a hero mark, a QR corner). The ladder exists
      because seven call sites had settled on 15px, which is on no scale and
      sits between two type steps. */
  size?: IconSize | number;
  strokeWidth?: number;
  /** Accessible name. Omit for a decorative glyph beside its own text — the
      icon is then aria-hidden. */
  label?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({
  name, size = 18, strokeWidth = 1.75, label, style, className,
}: IconProps) {
  const Cmp = ICONS[name];
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

export type { IconName, IconSize };
