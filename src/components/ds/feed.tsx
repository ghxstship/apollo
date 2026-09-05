/* feed — the Open Deck group from the design system, ported 1:1.
   Hail is the single reaction (no like counts); moderation is flag → the
   Bridge's queue → remove or leave up. The confession-booth motif lives in the
   composer's voice, not the surface's name. */
"use client";

import React from "react";
import { Avatar, Badge } from "./display";
import { Button } from "./actions";
import { Dialog } from "./feedback";

const MONO = "var(--font-mono)";
const BODY = "var(--font-sans)";

type Tone = "ink" | "sea" | "gold" | "sand";

export interface PostCardProps {
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
}

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
}: PostCardProps) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--space-4) var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        fontFamily: BODY,
        ...style,
      }}
    >
      {/* Wrapping, and allowed to shrink. A post carrying a sailing chip pushed
          the byline past the right edge — five of nine on the Open Deck ran to
          521px in a 375px viewport, and the page would not scroll to them, so
          the league and the age were simply unreachable. */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", minWidth: 0 }}>
        <Avatar name={author} tone={tone} size="sm" />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-body)" }}>{author}</span>
        {/* A hand-rolled pill until now: 9px off the label step, in
            --brand-yacht, which is UN Limited's IDENTITY hue spent on a
            per-post qualifier — and at 2.1:1 on paper, unreadable. It is the
            neutral status face of the badge the whole app already uses. */}
        {sailing ? <Badge tone="outline">{sailing}</Badge> : null}
        <span style={{ marginLeft: "auto", font: `400 var(--text-2xs)/1 ${MONO}`, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
          {timestamp}
        </span>
      </div>
      {body ? <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--text-body)" }}>{body}</div> : null}
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-3)" }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export interface HailProps {
  count?: number;
  hailed?: boolean;
  onToggle?: () => void;
  style?: React.CSSProperties;
}

export function Hail({
  count = 0,
  hailed = false,
  onToggle,
  style,
}: HailProps) {
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
        gap: "var(--space-2)",
        font: `700 var(--text-2xs)/1 ${MONO}`,
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
        color: hailed ? "var(--text-gold)" : "var(--text-muted)",
        padding: "var(--space-1) 0",
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

export type FeedComment = {
  /** The comment's own id, used as its React key. A thread is prepended to —
      a new word lands at the top — and an index key would then hand every
      existing row the state of the row above it: the wrong avatar, the wrong
      timestamp, and any open control in the row reset. Omit it and the key
      falls back to the comment's own content, which is stable under a
      prepend in a way that a position is not. */
  id?: string;
  author: string; tone?: Tone; timestamp?: string; body: string;
};

/** A key that survives a prepend. The id when there is one; otherwise the
    content, which does not change when a row moves down the list. */
function commentKey(c: FeedComment): string {
  return c.id ?? `${c.author}|${c.timestamp ?? ""}|${c.body}`;
}

export interface CommentThreadProps {
  comments?: FeedComment[];
  emptyLabel?: string;
  style?: React.CSSProperties;
}

export function CommentThread({
  comments = [],
  emptyLabel = "No words yet. First names only.",
  style,
}: CommentThreadProps) {
  if (!comments.length)
    return (
      <div style={{ padding: "var(--space-4) 0", fontSize: "var(--text-sm)", color: "var(--text-faint)", fontFamily: BODY, ...style }}>
        {emptyLabel}
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: BODY, ...style }}>
      {comments.map((c, i) => (
        <div key={commentKey(c)} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-3) 0", borderTop: i ? "1px solid var(--border-subtle)" : "none" }}>
          <Avatar name={c.author} tone={c.tone ?? "ink"} size="sm" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
              {/* A comment is subordinate to the post it hangs off, and the
                  app's own comment bubble (.wd-cmt__b) is already --text-xs;
                  13 was doing the job of 12 here. */}
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--text-body)" }}>{c.author}</span>
              <span style={{ font: `400 var(--text-3xs)/1 ${MONO}`, color: "var(--text-faint)" }}>{c.timestamp}</span>
            </div>
            <span style={{ fontSize: "var(--text-xs)", lineHeight: 1.5, color: "var(--text-body)" }}>{c.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Two ways to post. With `onPost` the composer is a controlled widget: it
   holds the text, calls back with it and clears. With `action` it is a form —
   the textarea carries `name`, the button submits, and the parent's server
   action (or route) receives the FormData; React resets the form when the
   action settles and the button disables itself again. `pending` marks the
   submit in flight either way. They are mutually exclusive: see below. */
interface ComposerBase {
  placeholder?: string;
  /** Accessible name of the textarea. */
  label?: string;
  submitLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** Field name the form submits under. */
  name?: string;
  defaultValue?: string;
  sailing?: string | null;
  onAttachSailing?: () => void;
  disabled?: boolean;
  pending?: boolean;
  style?: React.CSSProperties;
}

/** The form shape: the textarea carries `name`, the button submits, and the
    parent's server action receives the FormData. */
interface ComposerFormProps extends ComposerBase {
  action: React.FormHTMLAttributes<HTMLFormElement>["action"];
  onPost?: never;
}

/** The widget shape: the composer holds the text and hands it back. */
interface ComposerWidgetProps extends ComposerBase {
  action?: never;
  onPost?: (text: string) => void;
}

/* Two ways to post, and exactly one of them per composer. The prose under
   here said "`onPost` is ignored" when both were given, which is a rule only
   a reader of this file could know and one the call site could not see at
   all: a composer written with both looked like it worked and silently
   dropped every post into the wrong one. It is a union now, so writing both
   does not compile. */
export type ComposerProps = ComposerFormProps | ComposerWidgetProps;

export function Composer({
  placeholder = "The booth is open. Say it like the cameras are on.",
  label = "Post to the deck",
  submitLabel = "Post to the deck",
  pendingLabel = "Posting…",
  name = "body",
  action,
  defaultValue,
  sailing,
  onAttachSailing,
  onPost,
  disabled,
  pending = false,
  style,
}: ComposerProps) {
  const [text, setText] = React.useState(defaultValue ?? "");
  const canPost = !disabled && !pending && !!text.trim();
  const boxStyle: React.CSSProperties = {
    background: "var(--surface-card)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
    fontFamily: BODY,
    ...style,
  };
  const inner = (
    <>
      <textarea
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        rows={3}
        disabled={disabled}
        className="ls-writein"
        style={{
          resize: "vertical",
          background: "transparent",
          border: "none",
          fontFamily: BODY,
          fontWeight: 400,
          lineHeight: 1.55,
          color: "var(--text-body)",
          minHeight: 56,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
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
              color: "var(--text-faint)",
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
            type={action ? "submit" : "button"}
            disabled={!canPost}
            pending={pending}
            pendingLabel={pendingLabel}
            onClick={action ? undefined : () => {
              onPost?.(text);
              setText("");
            }}
          >
            {submitLabel}
          </Button>
        </span>
      </div>
    </>
  );
  if (action) {
    /* React resets the form after the action settles; the reset event is
       what clears the controlled text, so the button disables again. */
    return <form action={action} style={boxStyle} onReset={() => setText("")}>{inner}</form>;
  }
  return <div style={boxStyle}>{inner}</div>;
}

export interface FlagButtonProps {
  flagged?: boolean;
  onFlag?: () => void;
  style?: React.CSSProperties;
}

export function FlagButton({
  flagged = false,
  onFlag,
  style,
}: FlagButtonProps) {
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
        color: flagged ? "var(--text-faint)" : "var(--text-muted)",
        padding: "var(--space-1) 0",
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

export interface FlagQueueProps {
  items?: FlagItem[];
  onResolve?: (item: FlagItem, action: "leave" | "remove") => void;
  emptyLabel?: string;
  style?: React.CSSProperties;
}

export function FlagQueue({
  items = [],
  onResolve,
  emptyLabel = "Nothing flagged. The deck polices itself tonight.",
  style,
}: FlagQueueProps) {
  const [pick, setPick] = React.useState<FlagItem | null>(null);
  const th = (right = false): React.CSSProperties => ({
    textAlign: right ? "right" : "left",
    padding: "var(--space-3) var(--space-4)",
    font: `700 var(--text-2xs)/1 ${MONO}`,
    letterSpacing: "var(--tracking-label)",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border-strong)",
  });
  const td: React.CSSProperties = { padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-subtle)" };
  return (
    <div style={{ fontFamily: BODY, ...style }}>
      {!items.length ? <div style={{ padding: "var(--space-4) 0", fontSize: "var(--text-sm)", color: "var(--text-faint)" }}>{emptyLabel}</div> : null}
      {items.length > 0 ? (
        /* The Bridge's other tables sit in .ls-table-wrap; this one did not, so
           on a phone the moderation queue pushed the page 10px wide and made it
           scroll sideways instead of scrolling the table. */
        <div className="ls-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", color: "var(--text-body)" }}>
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
                  <span style={{ color: "var(--text-muted)" }}>{it.excerpt}</span>
                </td>
                <td style={{ ...td, font: `400 var(--text-xs)/1 ${MONO}` }}>{it.flaggedBy}</td>
                <td style={{ ...td, font: `400 var(--text-2xs)/1 ${MONO}`, color: "var(--text-faint)", whiteSpace: "nowrap" }}>{it.when}</td>
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
          <span style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--text-muted)" }}>&ldquo;{pick.excerpt}&rdquo;</span>
        ) : null}
      </Dialog>
    </div>
  );
}
