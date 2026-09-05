import React from "react";
import { Icon } from "./icon";
import { ANCHOR, COMMERCE, DIVISION_ACCENT, lockup, lockupSuffix, type DivisionId, type LockupForm } from "@/lib/brand";

/* — Card — */
const SEAS: Record<string, string> = {
  dawn: "var(--sea-dawn)",
  day: "var(--sea-day)",
  dusk: "var(--sea-dusk)",
};

/* A Card is a container, never a control. It used to take an `onClick` and
   dress itself as `role="button"` with a tabIndex and an Enter/Space handler —
   around a `footer` that every call site fills with Buttons and LinkButtons.
   A button containing buttons has no accessibility mapping: several screen
   readers flatten the subtree, so the inner controls became unreachable, and
   the outer name swallowed the whole card body into one announcement.

   The affordance belongs to the thing being navigated to, not to the box.
   Wrap the card in a link — `.ws-card-link` in site.css is exactly that
   wrapper, and the home grid already used it — or put a LinkButton in the
   footer. No call site passed `onClick`, so nothing that was clickable stopped
   being clickable when the prop came off. */
export function Card({
  eyebrow, title, meta, media, children, footer, tone = "shore",
  className = "", style,
}: {
  eyebrow?: React.ReactNode; title?: React.ReactNode; meta?: React.ReactNode[];
  media?: string; children?: React.ReactNode; footer?: React.ReactNode;
  tone?: "shore" | "sea";
  className?: string; style?: React.CSSProperties;
}) {
  const cls = ["ls-card", "ls-card--" + tone, className].filter(Boolean).join(" ");
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
    <div className={cls} style={style}>
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
}: { tone?: "gold" | "ink" | "positive" | "caution" | "danger" | "outline"; inverse?: boolean; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  const cls = ["ls-badge", "ls-badge--" + tone, inverse ? "ls-badge--inverse" : "", className].filter(Boolean).join(" ");
  return <span className={cls} {...rest}>{children}</span>;
}

/* — Tag —
   A clickable Tag used to be `role="button"` painted onto the span itself,
   with a real `<button className="ls-tag__x">` nested inside it whenever the
   tag was removable: a control inside a control, which maps to nothing. The
   press is now a real inner button — `.ls-tag__press`, which fills the tag and
   inherits its face — and the remove button is its SIBLING rather than its
   child, so both are reachable and each announces itself.

   The span keeps the border, the padding and the row's flex gap; it carries no
   role, no tabIndex and no key handling.

   `disabled` keeps a clickable Tag in the row — so a filter axis does not
   reflow when one value has nothing behind it — and disables the inner press
   button. On a Tag with nothing to press it is the span's aria-disabled that
   says so, since there is no control to carry it. */
export function Tag({
  active = false, disabled = false, onClick, onRemove, removeLabel = "Remove", className = "", children, ...rest
}: { active?: boolean; disabled?: boolean; onClick?: React.MouseEventHandler; onRemove?: React.MouseEventHandler; removeLabel?: string; className?: string; children?: React.ReactNode } & Omit<React.HTMLAttributes<HTMLSpanElement>, "onClick">) {
  const cls = ["ls-tag", active ? "ls-tag--active" : "", onClick ? "ls-tag--click" : "", disabled ? "ls-tag--disabled" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-disabled={!onClick && disabled ? true : undefined} {...rest}>
      {onClick ? (
        <button type="button" className="ls-tag__press" aria-pressed={active} disabled={disabled} onClick={onClick}>
          {children}
        </button>
      ) : children}
      {onRemove ? <button type="button" className="ls-tag__x" aria-label={removeLabel} onClick={(e) => { e.stopPropagation(); onRemove(e); }}><Icon name="X" size={12} /></button> : null}
    </span>
  );
}

/* — Avatar — */
const initials = (n: string) => String(n || "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");

export function Avatar({
  name = "", tone = "ink", size = "md", ring = false, className = "", style, ...rest
}: { name?: string; tone?: "ink" | "sea" | "gold" | "sand"; size?: "sm" | "md" | "lg"; ring?: boolean; className?: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    /* Initials are read as letters — "J C" — so the disc carries the name as
       an image label; a nameless avatar is decorative and hidden. */
    <span className={["ls-avatar", "ls-avatar--" + tone, "ls-avatar--" + size, ring ? "ls-avatar--ring" : "", className].filter(Boolean).join(" ")} style={style} title={name}
      role={name ? "img" : undefined} aria-label={name || undefined} aria-hidden={name ? undefined : true} {...rest}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}

export function AvatarGroup({ children, className = "", style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <span className={["ls-avatar-group", className].filter(Boolean).join(" ")} style={style}>{children}</span>;
}

/* — Stat — */
export function Stat({
  label, value, sub, size, inverse = false, className = "", style,
}: { label?: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode;
  /** md (default) sets the value at --text-3xl; sm at --text-2xl. */
  size?: "sm" | "md"; inverse?: boolean; className?: string; style?: React.CSSProperties }) {
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
  /* Money and counts read down the last digit. Set align:"end" on those; leave
     a boarding code, a slug or a date at the start even though it is mono. */
  align?: "start" | "end";
  /** A column of figures: mono, tabular, aligned to the end. Shorthand for
      `mono` + `align:"end"`. */
  numeric?: boolean;
  render?: (row: R) => React.ReactNode;
}

/** One `<tbody>` of a grouped table — a statement's month, a roster's
    watch. `summary` is an optional closing row of display-ready cells keyed
    by column (a subtotal), drawn in the total face. */
export interface TableGroup<R> {
  key?: React.Key;
  label: React.ReactNode;
  rows: R[];
  summary?: Partial<Record<string, React.ReactNode>>;
}

/* A column array written as a bare `const cols = [...]` widens `align: "end"`
   to `string` and then fails against TableColumn. Declare through this and the
   literals stay literal without `as const` on every entry:

     const cols = tableColumns<Row>([{ key: "amount", label: "Amount", numeric: true }, …]); */
export function tableColumns<R>(columns: TableColumn<R>[]): TableColumn<R>[] {
  return columns;
}

/* The table is pinned to width:100% inside a wrapper that scrolls, which meant
   the scroll could never engage — the columns squeezed instead, and on a phone
   the receipts table left about 40px for its widest text column. A min-width
   lets the wrapper do its job. It is derived from the column count rather than
   set flat, so a two-column table still fits a narrow screen rather than
   scrolling for no reason. Pass minWidth to override. */
function defaultMinWidth(count: number): number | undefined {
  if (count >= 6) return 780;
  if (count >= 4) return 640;
  if (count === 3) return 460;
  return undefined;
}

/* A row that is itself clickable still contains controls of its own — the
   roster's Remove button, a Switch in an action column, a link to a record.
   The keyboard path always checked that the key came from the row and not
   from something inside it; the pointer path did not, so a tap on an inner
   button ran the button AND opened the row's dialog behind it. Same test,
   applied to the pointer: if the click started inside a control, that control
   owns it. */
const INNER_CONTROL = "button,a,input,select,textarea";
function fromInnerControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INNER_CONTROL) !== null;
}

function cellClass<R>(c: TableColumn<R>): string {
  const end = c.numeric || c.align === "end";
  return [c.mono || c.numeric ? "num" : "", end ? "num--end" : ""].filter(Boolean).join(" ");
}

/* `groups` renders one <tbody> per group with a header row spanning the table
   (scope="rowgroup") and an optional summary row; `rows` renders the single
   body it always did. `rowHeader` names the column whose cell is the row's
   heading — <th scope="row"> — so a screen reader announces the member's name,
   not the column label, as it moves along the row. `rowClassName` lets a
   caller stripe a row by its status without reaching past the component. */
export function Table<R extends Record<string, unknown>>({
  columns = [], rows = [], groups, rowKey, rowHeader, rowClassName, onRowClick, dense = false, inverse = false,
  tall = false, minWidth, className = "", style,
}: {
  columns: TableColumn<R>[]; rows?: R[]; groups?: TableGroup<R>[]; rowKey?: (row: R) => React.Key;
  /** Key of the column rendered as `<th scope="row">`. */
  rowHeader?: string;
  rowClassName?: (row: R) => string | undefined | null | false;
  onRowClick?: (row: R) => void; dense?: boolean; inverse?: boolean;
  /* A long table keeps its header in view instead of scrolling it away. */
  tall?: boolean; minWidth?: number | false;
  className?: string; style?: React.CSSProperties;
}) {
  const min = minWidth === false ? undefined : (minWidth ?? defaultMinWidth(columns.length));
  const renderRow = (r: R, i: number) => (
    /* A clickable row was mouse-only: the Bridge's crew queue and member
       roster both open their detail dialog from a bare <tr onClick>, so
       a keyboard could reach every filter and no record. Focusable and
       Enter/Space-activated now — the row keeps its table semantics
       rather than being relabelled a button, which would cost a screen
       reader the column headers it reads out with each cell. */
    <tr
      key={rowKey ? rowKey(r) : i}
      className={[onRowClick ? "ls-table__row--click" : "", rowClassName ? rowClassName(r) || "" : ""].filter(Boolean).join(" ") || undefined}
      onClick={onRowClick ? (e) => { if (fromInnerControl(e.target)) return; onRowClick(r); } : undefined}
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
      {columns.map((c) => {
        const content = c.render ? c.render(r) : (r[c.key] as React.ReactNode);
        const cls = cellClass(c) || undefined;
        return rowHeader === c.key
          ? <th key={c.key} scope="row" className={cls}>{content}</th>
          : <td key={c.key} className={cls}>{content}</td>;
      })}
    </tr>
  );
  const renderBody = (list: R[], key?: React.Key, group?: TableGroup<R>) => (
    <tbody key={key}>
      {group ? (
        <tr className="ls-table__group">
          <th scope="rowgroup" colSpan={columns.length}>{group.label}</th>
        </tr>
      ) : null}
      {list.map(renderRow)}
      {group?.summary ? (
        <tr className="ls-table__row--total">
          {columns.map((c) => <td key={c.key} className={cellClass(c) || undefined}>{group.summary![c.key]}</td>)}
        </tr>
      ) : null}
    </tbody>
  );
  return (
    <div className={["ls-table-wrap", tall ? "ls-table-wrap--tall" : ""].filter(Boolean).join(" ")}>
      <table
        className={["ls-table", dense ? "ls-table--dense" : "", inverse ? "ls-table--inverse" : "", className].filter(Boolean).join(" ")}
        style={min ? { minWidth: min, ...style } : style}
      >
        {/* An action column is declared with an empty label so nothing shows
            above its switch or button — but an empty <th> is a header a
            screen reader reads out as nothing for every cell beneath it. The
            header is there and hidden, not absent. */}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric || c.align === "end" ? "num--end" : ""} style={c.width ? { width: c.width } : undefined}>{c.label == null || c.label === "" ? <span className="ls-visually-hidden">Actions</span> : c.label}</th>)}</tr></thead>
        {groups
          ? groups.map((g, gi) => renderBody(g.rows, g.key ?? gi, g))
          : renderBody(rows)}
      </table>
    </div>
  );
}

/* — ReviewList / ReviewRow —
   The label-left, figure-right list every checkout, receipt and confirmation
   was drawing for itself: a <dl>, one row per line, the figure in mono with
   tabular digits so a column of amounts reads down the last digit.

     <ReviewList>
       <ReviewRow label="2 passes" value="$120.00" />
       <ReviewRow label="Dues credit" value="−$20.00" muted />
       <ReviewRow label="Total" value="$100.00" total />
     </ReviewList>

   `first` drops the top rule (for a list that opens flush under a heading),
   `total` draws the closing rule and sets the figure heavy, `muted` fades a
   line that is information rather than a charge. */
export function ReviewList({
  children, dense = false, inverse = false, className = "", style, ...rest
}: { children?: React.ReactNode; dense?: boolean; inverse?: boolean; className?: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={["ls-review", dense ? "ls-review--dense" : "", inverse ? "ls-review--inverse" : "", className].filter(Boolean).join(" ")} style={style} {...rest}>
      {children}
    </dl>
  );
}

export function ReviewRow({
  label, value, children, first = false, total = false, muted = false, className = "", style,
}: {
  label: React.ReactNode;
  /** The figure. `children` is an alias for a value that is markup. */
  value?: React.ReactNode; children?: React.ReactNode;
  first?: boolean; total?: boolean; muted?: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={["ls-review__row", first ? "ls-review__row--first" : "", total ? "ls-review__row--total" : "", muted ? "ls-review__row--muted" : "", className].filter(Boolean).join(" ")} style={style}>
      <dt className="ls-review__label">{label}</dt>
      <dd className="ls-review__value">{value ?? children}</dd>
    </div>
  );
}

/* — Wordmark —
   The brand has no logo asset. The mark is type-set, and this is the only place
   it is set, so that the invariants in docs/brand/brand-architecture.md hold by
   construction rather than by review:

   - The brackets are part of the mark. `[un]` is a literal in the JSX below and
     there is no prop that removes, restyles, recolours, or spaces them out.
   - Never a suffix without the anchor: the anchor renders unconditionally.
   - Never two suffixes in one lockup: `suffix` is one optional value, not a
     list, so a second one is not expressible.
   - `[un]` is typed lowercase — the case is part of the mark (owner ruling
     2026-08-31, matching the kit's specimens) — and the suffix is sentence
     case, except for the two sanctioned variants. Whatever case the caller
     passes is normalised
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

/** The six sanctioned suffixes. Tighter than the package's .d.ts, which unions
    the literals with bare `string` and so accepts anything at all — the six
    divisions are the whole set, and a seventh is a brand decision, not a prop
    value. "Brand" landed with kit v2 (2026-08): [un] Brand, nautical lifestyle,
    fashion, and gear — no accent, its sub line renders in ink. */
export type DivisionSuffix = "Hinged" | "Bound" | "Limited" | "Scripted" | "Cut" | "Brand";

interface WordmarkBase {
  /** sm 16 / md 20 / lg 36, or a px number. The lockup is one of the four
      documented exemptions from the Anton ≥22px floor. */
  size?: "sm" | "md" | "lg" | number;
  /** Division suffix, sentence case. Pass null for the bare [un] parent anchor
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
            /* --text-inverse-2 (ivory-300) for the literal rgba(241,241,237,.8)
               it replaces — the same ivory at the ramp's second step rather
               than an alpha nothing else in the kit uses. */
            color: inverse ? "var(--text-inverse-2)" : WM_ACCENTS[tone] ?? WM_ACCENTS.hinged,
          }}
        >
          {sub}
        </span>
      ) : null}
    </span>
  );
}

/* — LockupText —
   The running-text form of the mark, for contexts that transform their text.
   An eyebrow's text-transform:uppercase rendered lockup() as "[UN] SCRIPTED"
   on six member pages — the anchor's case is part of the mark and no context
   may touch it, so the string ships inside its own transform:none, the same
   doctrine as the tagline lockup. Use this, never bare lockup(), anywhere a
   CSS transform can reach. */
export function LockupText({ division }: { division: DivisionId }) {
  return <span style={{ textTransform: "none" }}>{lockup(division)}</span>;
}

export { Icon };
