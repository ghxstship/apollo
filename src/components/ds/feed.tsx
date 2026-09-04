/* feed — the Open Deck group from the design system, ported 1:1.
   Hail is the single reaction (no like counts); moderation is flag → the
   Bridge's queue → remove or leave up. The confession-booth motif lives in the
   composer's voice, not the surface's name. */
"use client";

import React from "react";
import { Avatar, Badge, Button } from "@/components/ds";
import { Dialog } from "./feedback";

const MONO = "var(--font-mono)";
const BODY = "var(--font-sans)";

type Tone = "ink" | "sea" | "gold" | "sand";

export function PostCard({
  author,
  tone = "ink",
  body,
  sailing,
  timestamp,
  media = null,
  mediaAlt = "",
  footer,
  children,
  style,
}: {
  author: string;
  tone?: Tone;
  body?: React.ReactNode;
  sailing?: string;
  timestamp?: string;
  /* A real frame, or nothing. This used to be a boolean that drew a night
     gradient stamped IMAGERY TK — a placeholder from the design handoff that
     was shipping to members in production. A post attached to an episode with
     an approved frame shows that frame; every other post has no media slot at
     all. The URL is a short-lived signed one the server mints — the bucket is
     private, so a storage path is not a URL anywhere. */
  media?: string | null;
  mediaAlt?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-faint)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: BODY,
        ...style,
      }}
    >
      {/* Wrapping, and allowed to shrink. A post carrying a sailing chip pushed
          the byline past the right edge — five of nine on the Open Deck ran to
          521px in a 375px viewport, and the page would not scroll to them, so
          the league and the age were simply unreachable. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <Avatar name={author} tone={tone} size="sm" />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-1)" }}>{author}</span>
        {/* A hand-rolled pill until now: 9px off the label step, in
            --brand-yacht, which is UN Limited's IDENTITY hue spent on a
            per-post qualifier — and at 2.1:1 on paper, unreadable. It is the
            neutral status face of the badge the whole app already uses. */}
        {sailing ? <Badge tone="outline">{sailing}</Badge> : null}
        <span style={{ marginLeft: "auto", font: `400 var(--text-2xs)/1 ${MONO}`, color: "var(--text-3)", whiteSpace: "nowrap" }}>
          {timestamp}
        </span>
      </div>
      {body ? <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--text-1)" }}>{body}</div> : null}
      {media ? (
        <div style={{ height: 180, borderRadius: "var(--radius-sm)", background: "var(--scene-night)", position: "relative", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL that expires in an hour; next/image cannot cache what it may not fetch twice */}
          <img
            src={media}
            alt={mediaAlt}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : null}
      {children}
      {footer ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid var(--line-faint)", paddingTop: 10 }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function Hail({
  count = 0,
  hailed = false,
  onToggle,
  style,
}: {
  count?: number;
  hailed?: boolean;
  onToggle?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className="ls-bare"
      onClick={onToggle}
      aria-pressed={hailed}
      style={{
        cursor: onToggle ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        font: `700 var(--text-2xs)/1 ${MONO}`,
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
        color: hailed ? "var(--text-gold)" : "var(--text-2)",
        padding: "6px 0",
        minHeight: 24,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "var(--text-xs)", lineHeight: 1 }}>
        {hailed ? "⚑" : "⚐"}
      </span>
      HAIL{count > 0 ? " · " + count : ""}
    </button>
  );
}

export type FeedComment = { author: string; tone?: Tone; timestamp?: string; body: string };

export function CommentThread({
  comments = [],
  emptyLabel = "No words yet. First names only.",
  style,
}: {
  comments?: FeedComment[];
  emptyLabel?: string;
  style?: React.CSSProperties;
}) {
  if (!comments.length)
    return (
      <div style={{ padding: "14px 0", fontSize: "var(--text-sm)", color: "var(--text-3)", fontFamily: BODY, ...style }}>
        {emptyLabel}
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: BODY, ...style }}>
      {comments.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: i ? "1px solid var(--line-faint)" : "none" }}>
          <Avatar name={c.author} tone={c.tone ?? "ink"} size="sm" />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              {/* A comment is subordinate to the post it hangs off, and the
                  app's own comment bubble (.wd-cmt__b) is already --text-xs;
                  13 was doing the job of 12 here. */}
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--text-1)" }}>{c.author}</span>
              <span style={{ font: `400 var(--text-3xs)/1 ${MONO}`, color: "var(--text-3)" }}>{c.timestamp}</span>
            </div>
            <span style={{ fontSize: "var(--text-xs)", lineHeight: 1.5, color: "var(--text-1)" }}>{c.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Composer({
  placeholder = "The booth is open. Say it like the cameras are on.",
  sailing,
  onAttachSailing,
  onPost,
  disabled,
  style,
}: {
  placeholder?: string;
  sailing?: string | null;
  onAttachSailing?: () => void;
  onPost?: (text: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [text, setText] = React.useState("");
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-faint)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: BODY,
        ...style,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Post to the deck"
        rows={3}
        className="ls-writein"
        style={{
          resize: "vertical",
          background: "transparent",
          border: "none",
          fontFamily: BODY,
          fontWeight: 400,
          lineHeight: 1.55,
          color: "var(--text-1)",
          minHeight: 56,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {sailing ? (
          <Badge tone="outline">{sailing}</Badge>
        ) : onAttachSailing ? (
          <button
            type="button"
            className="ls-bare"
            onClick={onAttachSailing}
            style={{
              cursor: "pointer",
              font: `700 var(--text-3xs)/1 ${MONO}`,
              letterSpacing: "var(--tracking-dense)",
              color: "var(--text-3)",
              minHeight: 24,
              whiteSpace: "nowrap",
            }}
          >
            + ATTACH A SAILING
          </button>
        ) : null}
        <span style={{ marginLeft: "auto" }}>
          <Button
            variant="gold"
            size="sm"
            disabled={disabled || !text.trim()}
            onClick={() => {
              onPost?.(text);
              setText("");
            }}
          >
            Post to the deck
          </Button>
        </span>
      </div>
    </div>
  );
}

export function FlagButton({
  flagged = false,
  onFlag,
  style,
}: {
  flagged?: boolean;
  onFlag?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className="ls-bare"
      onClick={onFlag}
      disabled={flagged}
      style={{
        cursor: flagged ? "default" : "pointer",
        font: `700 var(--text-3xs)/1 ${MONO}`,
        letterSpacing: "var(--tracking-dense)",
        textTransform: "uppercase",
        color: flagged ? "var(--text-3)" : "var(--text-2)",
        padding: "6px 0",
        minHeight: 24,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {flagged ? "FLAGGED · THE BRIDGE HAS IT" : "FLAG"}
    </button>
  );
}

export type FlagItem = {
  id: string;
  author: string;
  excerpt: string;
  flaggedBy: string;
  when: string;
};

export function FlagQueue({
  items = [],
  onResolve,
  emptyLabel = "Nothing flagged. The deck polices itself tonight.",
  style,
}: {
  items?: FlagItem[];
  onResolve?: (item: FlagItem, action: "leave" | "remove") => void;
  emptyLabel?: string;
  style?: React.CSSProperties;
}) {
  const [pick, setPick] = React.useState<FlagItem | null>(null);
  const th = (right = false): React.CSSProperties => ({
    textAlign: right ? "right" : "left",
    padding: "10px 12px",
    font: `700 var(--text-2xs)/1 ${MONO}`,
    letterSpacing: "var(--tracking-label)",
    color: "var(--text-2)",
    borderBottom: "1px solid var(--line-strong)",
  });
  const td: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid var(--line-faint)" };
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      {!items.length ? <div style={{ padding: "14px 0", fontSize: "var(--text-sm)", color: "var(--text-3)" }}>{emptyLabel}</div> : null}
      {items.length > 0 ? (
        /* The Bridge's other tables sit in .ls-table-wrap; this one did not, so
           on a phone the moderation queue pushed the page 10px wide and made it
           scroll sideways instead of scrolling the table. */
        <div className="ls-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", color: "var(--text-1)" }}>
          <thead>
            <tr>
              <th scope="col" style={th()}>POST</th>
              <th scope="col" style={th()}>FLAGGED BY</th>
              <th scope="col" style={th()}>WHEN</th>
              {/* An empty header is read as nothing for every cell beneath it — the
                  same fix Table makes for its action column. */}
              <th scope="col" style={th(true)}><span className="ls-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={{ ...td, maxWidth: 320 }}>
                  <span style={{ fontWeight: 500 }}>{it.author}</span> —{" "}
                  <span style={{ color: "var(--text-2)" }}>{it.excerpt}</span>
                </td>
                <td style={{ ...td, font: `400 var(--text-xs)/1 ${MONO}` }}>{it.flaggedBy}</td>
                <td style={{ ...td, font: `400 var(--text-2xs)/1 ${MONO}`, color: "var(--text-3)", whiteSpace: "nowrap" }}>{it.when}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Button variant="outline" size="sm" onClick={() => setPick(it)}>
                    Resolve
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
      <Dialog
        open={!!pick}
        onClose={() => setPick(null)}
        eyebrow={pick ? `FLAGGED BY ${pick.flaggedBy} · ${pick.when}` : undefined}
        title={pick ? `A post by ${pick.author}` : undefined}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (pick) onResolve?.(pick, "leave");
                setPick(null);
              }}
            >
              Leave it up
            </Button>
            <Button
              variant="gold"
              onClick={() => {
                if (pick) onResolve?.(pick, "remove");
                setPick(null);
              }}
            >
              Remove the post
            </Button>
          </>
        }
      >
        {pick ? (
          <span style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--text-2)" }}>&ldquo;{pick.excerpt}&rdquo;</span>
        ) : null}
      </Dialog>
    </div>
  );
}
