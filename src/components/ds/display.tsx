import React from "react";
import { Icon } from "./icon";
import { ANCHOR, COMMERCE, DIVISION_ACCENT, lockupSuffix, type DivisionId, type LockupForm } from "@/lib/brand";

/* — Card — */
const SEAS: Record<string, string> = {
  dawn: "var(--sea-dawn)",
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
};

export function Card({
  eyebrow, title, meta, media, children, footer, tone = "shore",
  onClick, className = "", style,
}: {
  eyebrow?: React.ReactNode; title?: React.ReactNode; meta?: React.ReactNode[];
  media?: string; children?: React.ReactNode; footer?: React.ReactNode;
  tone?: "shore" | "sea"; onClick?: React.MouseEventHandler;
  className?: string; style?: React.CSSProperties;
}) {
  const cls = ["ls-card", "ls-card--" + tone, onClick ? "ls-card--click" : "", className].filter(Boolean).join(" ");
  const mediaEl = media ? (
    <div className="ls-card__media">
      {SEAS[media] ? (
        <div style={{ background: SEAS[media] }}></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- media accepts arbitrary URLs; imagery is placeholder gradients until photography exists
        <img src={media} alt="" />
      )}
      {SEAS[media] ? <span className="ls-card__tk">IMAGERY TK</span> : null}
    </div>
  ) : null;
  return (
    <div className={cls} style={style} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      {mediaEl}
      <div className="ls-card__body">
        {eyebrow ? <div className="ls-card__eyebrow">{eyebrow}</div> : null}
        {title ? <div className="ls-card__title">{title}</div> : null}
        {Array.isArray(meta) && meta.length ? (
          <div className="ls-card__meta">
            {meta.map((m, i) => [i > 0 ? <span key={"s" + i}>·</span> : null, <span key={i}>{m}</span>])}
          </div>
        ) : null}
        {children ? <div className="ls-card__children">{children}</div> : null}
        {footer ? <div className="ls-card__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* — Badge — */
export function Badge({
  tone = "outline", inverse = false, className = "", children, ...rest
}: { tone?: "gold" | "ink" | "positive" | "caution" | "outline"; inverse?: boolean; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  const cls = ["ls-badge", "ls-badge--" + tone, inverse ? "ls-badge--inverse" : "", className].filter(Boolean).join(" ");
  return <span className={cls} {...rest}>{children}</span>;
}

/* — Tag — */
export function Tag({
  active = false, onClick, onRemove, removeLabel = "Remove", className = "", children, ...rest
}: { active?: boolean; onClick?: React.MouseEventHandler; onRemove?: React.MouseEventHandler; removeLabel?: string; className?: string; children?: React.ReactNode } & Omit<React.HTMLAttributes<HTMLSpanElement>, "onClick">) {
  const cls = ["ls-tag", active ? "ls-tag--active" : "", onClick ? "ls-tag--click" : "", className].filter(Boolean).join(" ");
  return (
    <span
      className={cls} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } } : undefined}
      aria-pressed={onClick ? active : undefined} {...rest}
    >
      {children}
      {onRemove ? <button type="button" className="ls-tag__x" aria-label={removeLabel} onClick={(e) => { e.stopPropagation(); onRemove(e); }}>✕</button> : null}
    </span>
  );
}

/* — Avatar — */
const initials = (n: string) => String(n || "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");

export function Avatar({
  name = "", tone = "ink", size = "md", ring = false, className = "", style, ...rest
}: { name?: string; tone?: "ink" | "sea" | "gold" | "sand"; size?: "sm" | "md" | "lg"; ring?: boolean; className?: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={["ls-avatar", "ls-avatar--" + tone, "ls-avatar--" + size, ring ? "ls-avatar--ring" : "", className].filter(Boolean).join(" ")} style={style} title={name} {...rest}>
      {initials(name)}
    </span>
  );
}

export function AvatarGroup({ children, className = "", style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <span className={["ls-avatar-group", className].filter(Boolean).join(" ")} style={style}>{children}</span>;
}

/* — Stat — */
export function Stat({
  label, value, sub, size, inverse = false, className = "", style,
}: { label?: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; size?: "sm"; inverse?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={["ls-stat", size === "sm" ? "ls-stat--sm" : "", inverse ? "ls-stat--inverse" : "", className].filter(Boolean).join(" ")} style={style}>
      {label ? <span className="ls-stat__label">{label}</span> : null}
      <span className="ls-stat__value">{value}</span>
      {sub ? <span className="ls-stat__sub">{sub}</span> : null}
    </div>
  );
}

/* — Table — */
export interface TableColumn<R> {
  key: string; label?: React.ReactNode; width?: number | string; mono?: boolean;
  render?: (row: R) => React.ReactNode;
}

export function Table<R extends Record<string, unknown>>({
  columns = [], rows = [], rowKey, onRowClick, dense = false, inverse = false, className = "", style,
}: {
  columns: TableColumn<R>[]; rows: R[]; rowKey?: (row: R) => React.Key;
  onRowClick?: (row: R) => void; dense?: boolean; inverse?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className="ls-table-wrap">
      <table className={["ls-table", dense ? "ls-table--dense" : "", inverse ? "ls-table--inverse" : "", className].filter(Boolean).join(" ")} style={style}>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            /* A clickable row was mouse-only: the Bridge's crew queue and member
               roster both open their detail dialog from a bare <tr onClick>, so
               a keyboard could reach every filter and no record. Focusable and
               Enter/Space-activated now — the row keeps its table semantics
               rather than being relabelled a button, which would cost a screen
               reader the column headers it reads out with each cell. */
            <tr
              key={rowKey ? rowKey(r) : i}
              className={onRowClick ? "ls-table__row--click" : ""}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      if (e.target !== e.currentTarget) return;
                      e.preventDefault();
                      onRowClick(r);
                    }
                  : undefined
              }
            >
              {columns.map((c) => <td key={c.key} className={c.mono ? "num" : ""}>{c.render ? c.render(r) : (r[c.key] as React.ReactNode)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* — Wordmark —
   The brand has no logo asset. The mark is type-set, and this is the only place
   it is set, so that the invariants in docs/brand/brand-architecture.md hold by
   construction rather than by review:

   - The brackets are part of the mark. `[UN]` is a literal in the JSX below and
     there is no prop that removes, restyles, recolours, or spaces them out.
   - Never a suffix without the anchor: the anchor renders unconditionally.
   - Never two suffixes in one lockup: `suffix` is one optional value, not a
     list, so a second one is not expressible.
   - `[UN]` is always caps and the suffix is always sentence case, except for
     the two sanctioned variants. Whatever case the caller passes is normalised
     — a suffix arriving as "HINGED" from a database column does not silently
     become the physical-goods setting.
   - Plain-sans lowercase is never permitted. The only lowercase path is
     `editorial`, which forces the serif italic with it. Lowercase is earned by
     the serif, never by the sans — there is no prop combination that yields
     lowercase in the mono.
   - The anchor is always ink (or ivory when inverted). Only the sub line
     carries accent, which is why `accent` types as a sub-line colour and the
     anchor's colour is not a prop at all.

   What the type system cannot carry, and what a reviewer still has to check:
   `caps` is a LARGE PHYSICAL GOODS setting — screen print, embroidered cap
   backs, yacht flags — and is wrong on every screen. `editorial` is for
   campaign headlines and deck openers and is banned in UI and navigation. Both
   are perfectly legal TypeScript in a nav bar.

   Suffix spacing: .3em, per the lockup rules in brand-architecture.md and the
   reference implementation. The handoff README quotes .61em in its §1 summary,
   which is the TAGLINE lockup's space — "one full character space … .61em of
   the tagline size, which is one Space Mono advance" — and not the division
   suffix's word space. Two sources against one, and the wider value visibly
   breaks the lockup at nav sizes. */
const WM_SIZES = { sm: 16, md: 20, lg: 36 } as const;

/* Anton's cap height is 0.859em, Space Mono's is 0.676em, so the suffix must
   scale UP to sit level with the bracket caps: 0.859 / 0.676 = 1.27.

   This shipped as 0.77 — that ratio INVERTED — because the reference the
   foundation was built from carried the inverted number and the comment beside
   it asserted the opposite of what the arithmetic says. Space Mono is shorter,
   so shrinking it further drives the suffix away from the caps it is supposed
   to match. At size="md" the suffix rendered 15px where it should render 25px:
   a lockup whose second half looked like a footnote, on every division mark in
   the product.

   The updated reference states the measurement explicitly — "Anton cap 0.859em,
   Space Mono cap 0.676em — 1.27 makes the suffix caps match the bracket caps.
   Measured, not eyeballed." Taken as measured. */
const WM_SFX_SCALE = 1.27;

const WM_ACCENTS: Record<DivisionId | "shop", string> = { ...DIVISION_ACCENT, shop: COMMERCE.shop.accent };

/** The five sanctioned suffixes. Tighter than the package's .d.ts, which unions
    the five literals with bare `string` and so accepts anything at all — the
    five divisions are the whole set, and a sixth is a brand decision, not a
    prop value. */
export type DivisionSuffix = "Hinged" | "Bound" | "Limited" | "Scripted" | "Cut";

interface WordmarkBase {
  /** sm 16 / md 20 / lg 36, or a px number. The lockup is one of the four
      documented exemptions from the Anton ≥22px floor. */
  size?: "sm" | "md" | "lg" | number;
  /** Division suffix, sentence case. Pass null for the bare [UN] parent anchor
      (System A) — used on avatars, app icons, passes, wayfinding, and anywhere
      the umbrella is speaking rather than a division. */
  suffix?: DivisionSuffix | null;
  /** Optional mono sub line under the lockup, e.g. "SINGLES SOCIAL CLUB". */
  sub?: React.ReactNode;
  /** Sub-line colour. Defaults to the division's own accent. */
  accent?: DivisionId | "shop";
  inverse?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/* editorial and caps are the two sanctioned variants of one setting — the
   casing matrix has three rows, not four and a combination. Modelled as a union
   so that passing both is a compile error rather than a silent precedence rule
   nobody can see from the call site. */
export type WordmarkProps = WordmarkBase &
  (
    | { editorial?: false; caps?: false }
    /** Serif italic lowercase — campaign headlines and deck openers only. */
    | { editorial: true; caps?: false }
    /** Mono ALL CAPS +.06em — large physical goods only. Never on screen. */
    | { editorial?: false; caps: true }
  );

export function Wordmark({
  size = "md", suffix = "Hinged", sub, accent, inverse = false,
  editorial = false, caps = false, className = "", style,
}: WordmarkProps) {
  const px = typeof size === "number" ? size : WM_SIZES[size] ?? 20;
  const sfxPx = Math.round(px * WM_SFX_SCALE);
  const form: LockupForm = editorial ? "editorial" : caps ? "caps" : "standard";
  const word = suffix ? lockupSuffix(suffix, form) : null;
  /* Falls back to the suffix's own division, then to hinged for the bare
     anchor — the sub line under a parent lockup still needs a colour. */
  const tone: DivisionId | "shop" =
    accent ?? ((suffix ? (suffix.toLowerCase() as DivisionId) : "hinged"));
  const ink = inverse ? "var(--ivory-100)" : "var(--text-body)";
  const sfxStyle: React.CSSProperties = editorial
    ? { font: `400 ${px}px/1 var(--font-editorial)`, fontStyle: "italic", marginLeft: ".14em" }
    : { font: `700 ${sfxPx}px/1 var(--font-mono)`, letterSpacing: caps ? ".06em" : "-.01em", marginLeft: ".3em" };
  return (
    <span
      className={["ls-wm", inverse ? "ls-wm--inverse" : "", className].filter(Boolean).join(" ")}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1, ...style }}
    >
      <span style={{ display: "inline-flex", alignItems: "baseline", color: ink }}>
        <span style={{ font: `400 ${px}px/1 var(--font-display)`, letterSpacing: ".02em" }}>{ANCHOR}</span>
        {word ? <span style={sfxStyle}>{word}</span> : null}
      </span>
      {sub ? (
        <span
          style={{
            /* 9px is --text-3xs, the bottom of the ladder — the sub line stops
               shrinking with the lockup rather than going off-scale. */
            font: `700 ${Math.max(9, Math.round(px * 0.34))}px/1 var(--font-mono)`,
            letterSpacing: ".42em",
            marginTop: Math.round(px * 0.28),
            /* Optical centring: .42em of tracking is applied after the last
               glyph too, so the block sits half a step left without this. */
            marginLeft: ".42em",
            color: inverse ? "rgba(241,241,237,.8)" : WM_ACCENTS[tone] ?? WM_ACCENTS.hinged,
          }}
        >
          {sub}
        </span>
      ) : null}
    </span>
  );
}

export { Icon };
