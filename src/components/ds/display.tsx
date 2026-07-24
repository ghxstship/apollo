import React from "react";
import { Icon } from "./icon";

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
}: { tone?: "brass" | "ink" | "laurel" | "clay" | "outline"; inverse?: boolean; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
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
}: { name?: string; tone?: "ink" | "sea" | "brass" | "sand"; size?: "sm" | "md" | "lg"; ring?: boolean; className?: string; style?: React.CSSProperties } & React.HTMLAttributes<HTMLSpanElement>) {
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
        <thead><tr>{columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i} className={onRowClick ? "ls-table__row--click" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.key} className={c.mono ? "num" : ""}>{c.render ? c.render(r) : (r[c.key] as React.ReactNode)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* — Wordmark — */
const WM_SIZES: Record<string, number> = { sm: 15, md: 20, lg: 34 };

export function Wordmark({
  size = "md", sub, seam = false, inverse = false, className = "", style,
}: { size?: "sm" | "md" | "lg" | number; sub?: React.ReactNode; seam?: boolean; inverse?: boolean; className?: string; style?: React.CSSProperties }) {
  const px = typeof size === "number" ? size : WM_SIZES[size] || 20;
  return (
    <span className={["ls-wm", inverse ? "ls-wm--inverse" : "", className].filter(Boolean).join(" ")} style={{ fontSize: px, ...style }}>
      <span className="ls-wm__t" style={{ fontSize: px }}>LYRE SOCIAL</span>
      {sub ? <span className="ls-wm__sub" style={{ fontSize: Math.max(8, px * 0.42) }}>{sub}</span> : null}
      {seam ? <span className="ls-wm__seam"></span> : null}
    </span>
  );
}

export { Icon };
