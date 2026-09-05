/* logbook — the gamification group from the design system, ported 1:1.
   A logbook, never a leaderboard: figures accumulate, marks are permanent,
   contests are windowed and settle once. Values are the kit's own.

   One kit erratum corrected here: the kit's KnotsLedger labels its rewards
   section "The chandlery", which contradicts the kit's own shop ("the Slop
   Chest") and this brand's ban list. The heading reads The Shop. */
import React from "react";
import { Badge } from "./display";
import { cx } from "./class";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";
const BODY = "var(--font-sans)";

export type LogFigure = { value: string; label: string };

/* — FigureGrid —
   A ruled grid of figures with an optional "on the record since" line under
   it: what it draws, and now what it is called. It shipped as `PassageLog`,
   which is the name of a MEMBER'S RECORD — src/components/member/passage-log.tsx
   is that record, and it renders this grid as one of its parts. Two exports of
   one name in one product meant the barrel had to hand this one out as
   `KitPassageLog`, and the alias leaked: every call site imported a name no
   file declares, and the one place the two could be told apart was an
   `as` clause in index.ts.

   A kit primitive is named for what it renders, never for the one screen that
   reached for it first. The Season page's "In numbers" block is the same grid
   and is not a passage log at all. */
export interface FigureGridProps {
  figures?: LogFigure[];
  /** Renders "ON THE RECORD SINCE …" under the grid. */
  since?: string;
  emptyLabel?: string;
  style?: React.CSSProperties;
}

export function FigureGrid({
  figures = [],
  since,
  emptyLabel = "Nothing logged yet",
  style,
}: FigureGridProps) {
  if (!figures.length)
    return (
      <div style={{ padding: "var(--space-6) 0", font: `400 var(--text-sm)/1.5 ${BODY}`, color: "var(--text-faint)", ...style }}>
        {emptyLabel}
      </div>
    );
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      {/* The seams are the grid's own gap showing the container's ground
          through, not borders counted off the cell index. The index arithmetic
          this replaces (borderLeft on i % 6, borderTop on i >= 6) assumed six
          columns; auto-fit lays out three at 390px, so cells 3–5 lost their top
          rule and cell 3 gained a left one. A gap cannot be wrong about the
          wrap count — it is the same construction .plog-figs already uses. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
          gap: 1,
          background: "var(--border-subtle)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        {figures.map((f) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-4) var(--space-5)",
              background: "var(--surface-card)",
            }}
          >
            <span style={{ font: `700 var(--text-xl)/1 ${MONO}`, color: "var(--text-body)" }}>{f.value}</span>
            <span
              style={{
                font: `700 var(--text-3xs)/1.3 ${MONO}`,
                letterSpacing: "var(--tracking-dense)",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </span>
          </div>
        ))}
      </div>
      {since ? (
        <div
          style={{
            paddingTop: "var(--space-3)",
            font: `700 var(--text-2xs)/1 ${MONO}`,
            letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
            color: "var(--text-faint)",
          }}
        >
          ON THE RECORD SINCE {since}
        </div>
      ) : null}
    </div>
  );
}

export type MarkItem = {
  kind: string;
  name: string;
  detail?: string;
  held: boolean;
  date?: string;
};

export interface MarksListProps {
  marks?: MarkItem[];
  showAhead?: boolean;
  style?: React.CSSProperties;
}

export function MarksList({
  marks = [],
  showAhead = true,
  style,
}: MarksListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: BODY, ...style }}>
      {marks
        .filter((m) => m.held || showAhead)
        .map((m) => (
          /* A mark still ahead is muted by COLOUR, not by opacity. The row is a
             record, not a control, so §1.4.3's inactive-control exemption does
             not reach it — and at opacity .55 the name read 3.90:1, the detail
             2.53:1 and the trailing state 2.16:1, all three below AA. .ls-ahead
             (components.css) drops what INHERITS to --text-2 at full opacity,
             7.01:1 on the page, which is why the name below hands its colour
             back rather than pinning --text-1. The kind and state spans already
             carry their own muted tokens and are unchanged. */
          <div
            key={m.name}
            className={m.held ? undefined : "ls-ahead"}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--space-4)",
              padding: "var(--space-3) 0",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <span
              style={{
                font: `700 var(--text-3xs)/1 ${MONO}`,
                letterSpacing: "var(--tracking-dense)",
                textTransform: "uppercase",
                color: m.held ? "var(--text-gold)" : "var(--text-faint)",
                width: 88,
                flex: "none",
                whiteSpace: "nowrap",
              }}
            >
              {m.kind}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
              {/* Anton at 16px sat six below its 22px floor, hidden from the inline gate
                  because the family arrived through a constant rather than a literal.
                  §Type: below 22px a heading is Archivo 700, sentence case. */}
              <span style={{ font: `700 var(--text-md)/1.2 ${BODY}`, color: m.held ? "var(--text-body)" : undefined }}>{m.name}</span>
              {m.detail ? <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{m.detail}</span> : null}
            </span>
            <span
              style={{
                font: `700 var(--text-2xs)/1 ${MONO}`,
                letterSpacing: "var(--tracking-label)",
                color: "var(--text-faint)",
                whiteSpace: "nowrap",
              }}
            >
              {m.held ? m.date : "STILL AHEAD"}
            </span>
          </div>
        ))}
    </div>
  );
}

export interface ContestCardProps {
  shape?: "regatta" | "challenge";
  name: React.ReactNode;
  window?: string;
  metric?: string;
  award?: string;
  entered?: boolean;
  settled?: boolean;
  daysLeft?: number | null;
  onEnter?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function ContestCard({
  shape = "regatta",
  name,
  window: win,
  metric,
  award,
  entered = false,
  settled = false,
  daysLeft,
  onEnter,
  children,
  style,
}: ContestCardProps) {
  const shapeLabel = shape === "challenge" ? "CHALLENGE" : "REGATTA";
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid " + (entered && !settled ? "var(--border-gold)" : "var(--border-subtle)"),
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--space-5) var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        fontFamily: BODY,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          style={{
            font: `700 var(--text-3xs)/1 ${MONO}`,
            letterSpacing: "var(--tracking-dense)",
            color: settled ? "var(--text-faint)" : "var(--text-gold)",
            whiteSpace: "nowrap",
          }}
        >
          {shapeLabel}
          {win ? " · " + win : ""}
        </span>
        {settled ? (
          <span style={{ marginLeft: "auto", font: `700 var(--text-3xs)/1 ${MONO}`, letterSpacing: "var(--tracking-dense)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>
            SETTLED
          </span>
        ) : daysLeft != null ? (
          <span style={{ marginLeft: "auto", font: `700 var(--text-3xs)/1 ${MONO}`, letterSpacing: "var(--tracking-dense)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {daysLeft} DAYS LEFT
          </span>
        ) : null}
      </div>
      <div style={{ font: `400 var(--text-xl)/1.2 ${DISPLAY}`, textTransform: "uppercase", color: "var(--text-body)" }}>{name}</div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        {/* Two more hand-rolled badges, now the component. The split falls out
            of the family's own rule: a metric is what this contest MEASURES —
            a fact about the record, so the square neutral face; an award is a
            distinction the entrant CARRIES, so the identity pill. */}
        {metric ? <Badge tone="outline">{metric}</Badge> : null}
        {award ? <Badge tone="gold">{award}</Badge> : null}
        {entered && !settled ? (
          <span style={{ font: `700 var(--text-2xs)/1 ${MONO}`, letterSpacing: "var(--tracking-label)", color: "var(--positive)", whiteSpace: "nowrap" }}>
            ENTERED
          </span>
        ) : null}
      </div>
      {children}
      {!entered && !settled && onEnter ? (
        <button
          type="button"
          className="ls-bare"
          onClick={onEnter}
          style={{
            cursor: "pointer",
            alignSelf: "flex-start",
            font: `500 var(--text-sm)/1 ${BODY}`,
            color: "var(--text-gold)",
            padding: "var(--space-2) 0",
          }}
        >
          Enter →
        </button>
      ) : null}
    </div>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/* One line of a StandingsTable — a place, a name and a score.

   It was `StandingRow`, and so is an unrelated type in
   src/components/member/agreement-rows.tsx: a member's standing against the
   agreements they have signed, with none of these fields. Both were exported,
   one from the kit barrel and one from its own module, so which shape a
   `StandingRow` had depended on which import a file happened to have — and
   the two are three characters apart in an editor's auto-import list. This one
   is named for the table it is a row of. */
export type StandingsEntry = {
  name: string;
  score: string;
  place?: number | null;
  tie?: boolean;
  reached?: boolean;
};

export interface StandingsTableProps {
  rows?: StandingsEntry[];
  shape?: "regatta" | "challenge";
  frozen?: boolean;
  youName?: string | null;
  style?: React.CSSProperties;
}

export function StandingsTable({
  rows = [],
  shape = "regatta",
  frozen = false,
  youName,
  style,
}: StandingsTableProps) {
  const isCh = shape === "challenge";
  /* A settled result and a live provisional standing were pixel-identical
     apart from a 9px line under the table. Frozen is now carried by the form:
     the header rule drops to the faint step (nothing is being asked of you any
     more), the score column mutes, and the caption leads instead of trailing —
     you read FINAL before you read the places, not after. */
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "var(--space-3) var(--space-4)",
    font: `700 var(--text-2xs)/1 ${MONO}`,
    letterSpacing: "var(--tracking-label)",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: `1px solid var(${frozen ? "--line-faint" : "--line-strong"})`,
  };
  const caption: React.CSSProperties = {
    font: `700 var(--text-3xs)/1 ${MONO}`,
    letterSpacing: "var(--tracking-dense)",
    textTransform: "uppercase",
    color: "var(--text-faint)",
  };
  /* ROMAN runs out at XII, and a thirteenth entrant used to fall through to
     Arabic on its own row — X, XI, XII, 13, 14 down one column. Past twelve the
     WHOLE column is Arabic, so the numbering is one system either way. */
  const useRoman = !isCh && rows.length <= ROMAN.length;
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      {frozen ? <div style={{ ...caption, paddingBottom: "var(--space-3)" }}>FINAL · PUBLISHED ONCE</div> : null}
      {/* Two fixed columns and a name that may be long: without a scroll
          container the table pushed the page sideways at 390px. */}
      <div className="ls-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", color: "var(--text-body)" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 70 }}>{isCh ? "" : "PLACE"}</th>
              <th style={th}>NAME</th>
              <th style={{ ...th, textAlign: "right", width: 110 }}>{isCh ? "REACHED" : "SCORE"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const you = youName && r.name === youName;
              const place = r.place ?? i + 1;
              return (
                <tr key={r.name + i} style={{ background: you ? "var(--wash-gold)" : "transparent" }}>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--border-subtle)",
                      font: `700 var(--text-xs)/1 ${MONO}`,
                      color: i === 0 && !isCh ? "var(--text-gold)" : "var(--text-muted)",
                    }}
                  >
                    {isCh ? (r.reached ? "✓" : "—") : useRoman ? ROMAN[place - 1] ?? place : place}
                    {!isCh && r.tie ? " =" : ""}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {r.name}
                    {you ? (
                      <span style={{ marginLeft: "var(--space-2)", font: `700 var(--text-3xs)/1 ${MONO}`, letterSpacing: "var(--tracking-dense)", color: "var(--text-gold)" }}>
                        YOU
                      </span>
                    ) : null}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      borderBottom: "1px solid var(--border-subtle)",
                      textAlign: "right",
                      font: `700 var(--text-xs)/1 ${MONO}`,
                      color: frozen ? "var(--text-muted)" : undefined,
                    }}
                  >
                    {r.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {frozen ? null : <div style={{ ...caption, paddingTop: "var(--space-2)" }}>LIVE · SETTLES AT WINDOW CLOSE</div>}
    </div>
  );
}

export type LedgerEntry = {
  /** The entry's own id, used as its React key. The ledger is prepended to —
      the newest line is the top one — and an index key hands every existing
      row the identity of the row above it, which is how a month eyebrow ends
      up over the wrong run of entries. Omit it and the key falls back to the
      entry's own content, which does not change when a line moves down. */
  id?: string;
  reason: string; delta: string; date: string;
};
export type LedgerReward = { name: string; cost: string; costValue?: number };

/** The reward costs more than the balance. Not knowable when either figure is
    absent, in which case the control stays live and the server refuses. */
function short(balance: number | null | undefined, r: LedgerReward): boolean {
  return balance != null && r.costValue != null && r.costValue > balance;
}

export interface KnotsLedgerProps {
  balance?: number | null;
  entries?: LedgerEntry[];
  rewards?: LedgerReward[];
  onRedeem?: (r: LedgerReward) => void;
  style?: React.CSSProperties;
}

export function KnotsLedger({
  balance,
  entries = [],
  rewards = [],
  onRedeem,
  style,
}: KnotsLedgerProps) {
  const label: React.CSSProperties = {
    font: `700 var(--text-2xs)/1 ${MONO}`,
    letterSpacing: "var(--tracking-label)",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", fontFamily: BODY, ...style }}>
      {balance != null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <span style={label}>Knots</span>
          <span style={{ font: `400 var(--text-3xl)/1.05 ${DISPLAY}`, fontVariantNumeric: "tabular-nums", color: "var(--text-gold)" }}>{balance}</span>
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* A grid, not a flex line with auto widths: +1,200 and −80 on
              adjacent rows started at different x, so the column of figures had
              no edge to read down. Fixed tracks and an end-aligned, tabular
              delta give it one. The date keeps its own track for the same
              reason. */}
          {entries.map((e, i) => {
            /* The date arrives already set — "MAR 04" — so the month is its
               leading token. One mono eyebrow per run of a month turns a year
               of entries into months instead of one undifferentiated column. */
            const monthOf = (d: string) => String(d).trim().split(/\s+/)[0] ?? "";
            const month = monthOf(e.date);
            const prev = i > 0 ? monthOf(entries[i - 1].date) : null;
            return (
              <React.Fragment key={e.id ?? `${e.date}|${e.reason}|${e.delta}`}>
                {month && month !== prev ? (
                  <div
                    style={{
                      font: `700 var(--text-3xs)/1 ${MONO}`,
                      letterSpacing: "var(--tracking-dense)",
                      textTransform: "uppercase",
                      color: "var(--text-faint)",
                      padding: i === 0 ? "0 0 var(--space-2)" : "var(--space-5) 0 var(--space-2)",
                    }}
                  >
                    {month}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 88px 78px",
                    alignItems: "baseline",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <span style={{ fontSize: "var(--text-sm)" }}>{e.reason}</span>
                  <span
                    style={{
                      font: `700 var(--text-xs)/1 ${MONO}`,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "end",
                      color: String(e.delta).startsWith("−") || String(e.delta).startsWith("-") ? "var(--text-muted)" : "var(--positive)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.delta}
                  </span>
                  <span style={{ font: `400 var(--text-2xs)/1 ${MONO}`, color: "var(--text-faint)", whiteSpace: "nowrap", textAlign: "end" }}>{e.date}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : null}
      {rewards.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <span style={label}>The Shop</span>
          {rewards.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                background: "var(--surface-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ fontSize: "var(--text-sm)", flex: 1 }}>{r.name}</span>
              <span style={{ font: `700 var(--text-2xs)/1 ${MONO}`, color: "var(--text-gold)", whiteSpace: "nowrap" }}>{r.cost}</span>
              {onRedeem ? (
                /* Off because the balance will not cover it — and until now
                   nothing said so. The face was half-applied: an inline
                   cursor:pointer outranked `.ls-bare[disabled]{cursor:default}`
                   at (1,0,0), so a control that refuses the click still
                   offered the hand, and the only other cue was a fade with no
                   sentence anywhere near it. The cursor is the cascade's
                   again, and the reason is carried by the control itself, so a
                   reader who lands on it in browse mode is told what is
                   missing rather than that the button is simply unavailable.

                   The face is a class now — `.ls-redeem` in components.css,
                   beside the other component disabled faces — so the fade is
                   the stylesheet's decision rather than a token spelled out by
                   hand in a style object. */
                <button
                  type="button"
                  className={cx("ls-bare", "ls-redeem")}
                  onClick={() => onRedeem(r)}
                  disabled={short(balance, r)}
                  title={short(balance, r) ? `${r.cost} — more than the balance` : undefined}
                  aria-label={short(balance, r) ? `Redeem ${r.name} — ${r.cost}, more than the balance` : undefined}
                >
                  Redeem
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
