/* logbook — the gamification group from the design system, ported 1:1.
   A logbook, never a leaderboard: figures accumulate, marks are permanent,
   contests are windowed and settle once. Values are the kit's own.

   One kit erratum corrected here: the kit's KnotsLedger labels its rewards
   section "The chandlery", which contradicts the kit's own shop ("the Slop
   Chest") and this brand's ban list. The heading reads The Shop. */
import React from "react";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";
const BODY = "var(--font-sans)";

export type LogFigure = { value: string; label: string };

export function PassageLog({
  figures = [],
  since,
  emptyLabel = "Nothing logged yet",
  style,
}: {
  figures?: LogFigure[];
  since?: string;
  emptyLabel?: string;
  style?: React.CSSProperties;
}) {
  if (!figures.length)
    return (
      <div style={{ padding: "22px 0", font: `400 var(--text-sm)/1.5 ${BODY}`, color: "var(--text-3)", ...style }}>
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
          background: "var(--line-faint)",
          border: "1px solid var(--line-faint)",
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
              gap: 6,
              padding: "16px 18px",
              background: "var(--surface-card)",
            }}
          >
            <span style={{ font: `700 var(--text-xl)/1 ${MONO}`, color: "var(--text-1)" }}>{f.value}</span>
            <span
              style={{
                font: `700 9px/1.3 ${MONO}`,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: "var(--text-3)",
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
            paddingTop: 10,
            font: `700 10px/1 ${MONO}`,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--text-3)",
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

export function MarksList({
  marks = [],
  showAhead = true,
  style,
}: {
  marks?: MarkItem[];
  showAhead?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: BODY, ...style }}>
      {marks
        .filter((m) => m.held || showAhead)
        .map((m) => (
          <div
            key={m.name}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              padding: "12px 0",
              borderTop: "1px solid var(--line-faint)",
              opacity: m.held ? 1 : 0.55,
            }}
          >
            <span
              style={{
                font: `700 9px/1 ${MONO}`,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: m.held ? "var(--text-gold)" : "var(--text-3)",
                width: 88,
                flex: "none",
                whiteSpace: "nowrap",
              }}
            >
              {m.kind}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
              <span style={{ font: `400 16px/1.2 ${DISPLAY}`, color: "var(--text-1)" }}>{m.name}</span>
              {m.detail ? <span style={{ fontSize: 12, color: "var(--text-2)" }}>{m.detail}</span> : null}
            </span>
            <span
              style={{
                font: `700 10px/1 ${MONO}`,
                letterSpacing: ".1em",
                color: "var(--text-3)",
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
}: {
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
}) {
  const shapeLabel = shape === "challenge" ? "CHALLENGE" : "REGATTA";
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid " + (entered && !settled ? "var(--border-gold)" : "var(--line-faint)"),
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: BODY,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            font: `700 9px/1 ${MONO}`,
            letterSpacing: ".18em",
            color: settled ? "var(--text-3)" : "var(--text-gold)",
            whiteSpace: "nowrap",
          }}
        >
          {shapeLabel}
          {win ? " · " + win : ""}
        </span>
        {settled ? (
          <span style={{ marginLeft: "auto", font: `700 9px/1 ${MONO}`, letterSpacing: ".14em", color: "var(--text-3)", whiteSpace: "nowrap" }}>
            SETTLED
          </span>
        ) : daysLeft != null ? (
          <span style={{ marginLeft: "auto", font: `700 9px/1 ${MONO}`, letterSpacing: ".14em", color: "var(--text-2)", whiteSpace: "nowrap" }}>
            {daysLeft} DAYS LEFT
          </span>
        ) : null}
      </div>
      <div style={{ font: `400 22px/1.2 ${DISPLAY}`, color: "var(--text-1)" }}>{name}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {metric ? (
          <span
            style={{
              font: `700 10px/1 ${MONO}`,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {metric}
          </span>
        ) : null}
        {award ? (
          <span
            style={{
              font: `700 10px/1 ${MONO}`,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--text-gold)",
              border: "1px solid var(--border-gold)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {award}
          </span>
        ) : null}
        {entered && !settled ? (
          <span style={{ font: `700 10px/1 ${MONO}`, letterSpacing: ".12em", color: "var(--positive)", whiteSpace: "nowrap" }}>
            ENTERED
          </span>
        ) : null}
      </div>
      {children}
      {!entered && !settled && onEnter ? (
        <button
      className="ls-bare"
          onClick={onEnter}
          style={{
            all: "unset",
            cursor: "pointer",
            alignSelf: "flex-start",
            font: `500 var(--text-sm)/1 ${BODY}`,
            color: "var(--text-gold)",
            padding: "8px 0",
          }}
        >
          Enter →
        </button>
      ) : null}
    </div>
  );
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export type StandingRow = {
  name: string;
  score: string;
  place?: number | null;
  tie?: boolean;
  reached?: boolean;
};

export function StandingsTable({
  rows = [],
  shape = "regatta",
  frozen = false,
  youName,
  style,
}: {
  rows?: StandingRow[];
  shape?: "regatta" | "challenge";
  frozen?: boolean;
  youName?: string | null;
  style?: React.CSSProperties;
}) {
  const isCh = shape === "challenge";
  /* A settled result and a live provisional standing were pixel-identical
     apart from a 9px line under the table. Frozen is now carried by the form:
     the header rule drops to the faint step (nothing is being asked of you any
     more), the score column mutes, and the caption leads instead of trailing —
     you read FINAL before you read the places, not after. */
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    font: `700 var(--text-2xs)/1 ${MONO}`,
    letterSpacing: ".16em",
    textTransform: "uppercase",
    color: "var(--text-2)",
    borderBottom: `1px solid var(${frozen ? "--line-faint" : "--line-strong"})`,
  };
  const caption: React.CSSProperties = {
    font: `700 var(--text-3xs)/1 ${MONO}`,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color: "var(--text-3)",
  };
  /* ROMAN runs out at XII, and a thirteenth entrant used to fall through to
     Arabic on its own row — X, XI, XII, 13, 14 down one column. Past twelve the
     WHOLE column is Arabic, so the numbering is one system either way. */
  const useRoman = !isCh && rows.length <= ROMAN.length;
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      {frozen ? <div style={{ ...caption, paddingBottom: 10 }}>FINAL · PUBLISHED ONCE</div> : null}
      {/* Two fixed columns and a name that may be long: without a scroll
          container the table pushed the page sideways at 390px. */}
      <div className="ls-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", color: "var(--text-1)" }}>
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
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--line-faint)",
                      font: `700 var(--text-xs)/1 ${MONO}`,
                      color: i === 0 && !isCh ? "var(--text-gold)" : "var(--text-2)",
                    }}
                  >
                    {isCh ? (r.reached ? "✓" : "—") : useRoman ? ROMAN[place - 1] ?? place : place}
                    {!isCh && r.tie ? " =" : ""}
                  </td>
                  <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--line-faint)" }}>
                    {r.name}
                    {you ? (
                      <span style={{ marginLeft: 8, font: `700 var(--text-3xs)/1 ${MONO}`, letterSpacing: ".14em", color: "var(--text-gold)" }}>
                        YOU
                      </span>
                    ) : null}
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--line-faint)",
                      textAlign: "right",
                      font: `700 var(--text-xs)/1 ${MONO}`,
                      color: frozen ? "var(--text-2)" : undefined,
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
      {frozen ? null : <div style={{ ...caption, paddingTop: 8 }}>LIVE · SETTLES AT WINDOW CLOSE</div>}
    </div>
  );
}

export type LedgerEntry = { reason: string; delta: string; date: string };
export type LedgerReward = { name: string; cost: string; costValue?: number };

export function KnotsLedger({
  balance,
  entries = [],
  rewards = [],
  onRedeem,
  style,
}: {
  balance?: number | null;
  entries?: LedgerEntry[];
  rewards?: LedgerReward[];
  onRedeem?: (r: LedgerReward) => void;
  style?: React.CSSProperties;
}) {
  const label: React.CSSProperties = {
    font: `700 10px/1 ${MONO}`,
    letterSpacing: ".16em",
    textTransform: "uppercase",
    color: "var(--text-2)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: BODY, ...style }}>
      {balance != null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={label}>Knots</span>
          <span style={{ font: `400 var(--text-3xl)/1.05 ${DISPLAY}`, color: "var(--text-gold)" }}>{balance}</span>
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
              <React.Fragment key={i}>
                {month && month !== prev ? (
                  <div
                    style={{
                      font: `700 var(--text-3xs)/1 ${MONO}`,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                      padding: i === 0 ? "0 0 8px" : "18px 0 8px",
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
                    gap: 12,
                    padding: "10px 0",
                    borderTop: "1px solid var(--line-faint)",
                  }}
                >
                  <span style={{ fontSize: "var(--text-sm)" }}>{e.reason}</span>
                  <span
                    style={{
                      font: `700 12px/1 ${MONO}`,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "end",
                      color: String(e.delta).startsWith("−") || String(e.delta).startsWith("-") ? "var(--text-2)" : "var(--positive)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.delta}
                  </span>
                  <span style={{ font: `400 10px/1 ${MONO}`, color: "var(--text-3)", whiteSpace: "nowrap", textAlign: "end" }}>{e.date}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : null}
      {rewards.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={label}>The Shop</span>
          {rewards.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "var(--surface-card)",
                border: "1px solid var(--line-faint)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ fontSize: 14, flex: 1 }}>{r.name}</span>
              <span style={{ font: `700 var(--text-2xs)/1 ${MONO}`, color: "var(--text-gold)", whiteSpace: "nowrap" }}>{r.cost}</span>
              {onRedeem ? (
                <button
      className="ls-bare"
                  onClick={() => onRedeem(r)}
                  disabled={balance != null && r.costValue != null && r.costValue > balance}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    font: `500 12px/1 ${BODY}`,
                    color: "var(--text-gold)",
                    border: "1px solid var(--border-gold)",
                    borderRadius: "var(--radius-pill)",
                    padding: "7px 14px",
                    minHeight: 24,
                    opacity: balance != null && r.costValue != null && r.costValue > balance ? 0.45 : 1,
                  }}
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
