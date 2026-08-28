/* logbook — the gamification group from the [UN] kit, ported 1:1.
   A logbook, never a leaderboard: figures accumulate, marks are permanent,
   contests are windowed and settle once. Values are the kit's own.

   One kit erratum corrected here: the kit's KnotsLedger labels its rewards
   section "The chandlery", which contradicts the kit's own shop ("the
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
      <div style={{ padding: "22px 0", font: `400 13px/1.5 ${BODY}`, color: "var(--text-3)", ...style }}>
        {emptyLabel}
      </div>
    );
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
          border: "1px solid var(--line-faint)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        {figures.map((f, i) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "16px 18px",
              borderLeft: i % 6 ? "1px solid var(--line-faint)" : "none",
              borderTop: i >= 6 ? "1px solid var(--line-faint)" : "none",
              background: "var(--surface-card)",
            }}
          >
            <span style={{ font: `700 20px/1 ${MONO}`, color: "var(--text-1)" }}>{f.value}</span>
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
            font: `500 13px/1 ${BODY}`,
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
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    font: `700 10px/1 ${MONO}`,
    letterSpacing: ".16em",
    textTransform: "uppercase",
    color: "var(--text-2)",
    borderBottom: "1px solid var(--line-strong)",
  };
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, color: "var(--text-1)" }}>
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
            return (
              <tr key={r.name + i} style={{ background: you ? "rgba(211,177,94,.08)" : "transparent" }}>
                <td
                  style={{
                    padding: "11px 14px",
                    borderBottom: "1px solid var(--line-faint)",
                    font: `700 12px/1 ${MONO}`,
                    color: i === 0 && !isCh ? "var(--text-gold)" : "var(--text-2)",
                  }}
                >
                  {isCh ? (r.reached ? "✓" : "—") : ROMAN[r.place != null ? r.place - 1 : i] || r.place || i + 1}
                  {!isCh && r.tie ? " =" : ""}
                </td>
                <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--line-faint)" }}>
                  {r.name}
                  {you ? (
                    <span style={{ marginLeft: 8, font: `700 9px/1 ${MONO}`, letterSpacing: ".14em", color: "var(--text-gold)" }}>
                      YOU
                    </span>
                  ) : null}
                </td>
                <td
                  style={{
                    padding: "11px 14px",
                    borderBottom: "1px solid var(--line-faint)",
                    textAlign: "right",
                    font: `700 12px/1 ${MONO}`,
                  }}
                >
                  {r.score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        style={{
          paddingTop: 8,
          font: `700 9px/1 ${MONO}`,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {frozen ? "FINAL · PUBLISHED ONCE" : "LIVE · SETTLES AT WINDOW CLOSE"}
      </div>
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
          <span style={{ font: `400 38px/1.05 ${DISPLAY}`, color: "var(--text-gold)" }}>{balance}</span>
        </div>
      ) : null}
      {entries.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-faint)" }}>
              <span style={{ fontSize: 13, flex: 1 }}>{e.reason}</span>
              <span
                style={{
                  font: `700 12px/1 ${MONO}`,
                  color: String(e.delta).startsWith("−") || String(e.delta).startsWith("-") ? "var(--text-2)" : "var(--positive)",
                  whiteSpace: "nowrap",
                }}
              >
                {e.delta}
              </span>
              <span style={{ font: `400 10px/1 ${MONO}`, color: "var(--text-3)", whiteSpace: "nowrap" }}>{e.date}</span>
            </div>
          ))}
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
              <span style={{ font: `700 11px/1 ${MONO}`, color: "var(--text-gold)", whiteSpace: "nowrap" }}>{r.cost}</span>
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
