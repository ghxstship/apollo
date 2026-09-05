"use client";
import React from "react";
import { createPortal } from "react-dom";
import { cx } from "./class";
import { Icon, type IconName } from "./icon";
import { useMounted } from "./use-mounted";
import { useModal } from "./use-modal";
import { useExitPhase } from "./use-exit-phase";

/* — Dialog — */
export interface DialogProps {
  open: boolean; onClose?: () => void; eyebrow?: React.ReactNode; title?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; width?: number; closeLabel?: string;
  /** Accessible name when there is no `title` — a dialog with neither is
      announced as "dialog" and nothing else. */
  label?: string;
}

export function Dialog({
  open, onClose, eyebrow, title, children, footer, width = 520, closeLabel = "Close", label,
}: DialogProps) {
  const boxRef = useModal(open, onClose);
  const titleId = React.useId();
  /* The exit. A dialog that unmounts the frame `open` goes false cannot leave —
     it is simply gone — so it holds itself mounted for one --dur-exit with the
     --out class on the veil and unmounts on animationend. The prop change is
     caught during render (React's "adjust state from props" form) rather than
     in an effect, so the closing frame is the very next one and never a
     frame late. A safety timer covers an animationend that never fires (the
     tab was hidden mid-exit, say); under prefers-reduced-motion the animation
     is .01ms and animationend fires at once. useModal already saw `open` go
     false, so focus is back on the opener and the page scrolls again while the
     veil is still fading.

     The phase itself is useExitPhase, which is this logic named. Dialog wrote
     it first and four other overlays copied it; it lives in one file now so a
     sixth cannot drift. */
  const { present, closing, onAnimationEnd } = useExitPhase(open);
  /* The veil goes aria-hidden for the whole exit, and the × that was just
     pressed is INSIDE it — so for one --dur-exit a screen reader's focus sat
     on a control in a subtree it had been told to ignore, which is the
     aria-hidden violation with the worst failure mode: the reader is left
     pointing at nothing and most of them say nothing at all about it.

     Focus is dropped here, in a LAYOUT effect, so it happens in the same
     commit that sets the flag and before useModal's own (passive) cleanup
     runs — which then finds focus on the body and hands it back to the opener,
     exactly as it does when a dialog is dismissed by Escape. */
  const mounted = useMounted();
  React.useLayoutEffect(() => {
    if (!closing) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && boxRef.current?.contains(active)) active.blur();
  }, [closing, boxRef]);
  /* Portalled to the document root. The veil is z-index 1000 and the member
     tab bar is 300, but z-index only orders siblings within a stacking
     context — rendered in place, the dialog sat inside one the tab bar was not
     part of, and the bar painted straight over the footer. On a phone that put
     the tab bar on top of "CONFIRM YOUR PASS", and with body overflow hidden
     there was no way to scroll it clear: nobody on a phone could book a pass.

     Mounted state, because a portal has no document to aim at on the server. */
  if (!present || !mounted) return null;
  return createPortal(
    <div
      className={cx("ls-dialog-veil", closing && "ls-dialog-veil--out")}
      aria-hidden={closing || undefined}
      onClick={(e) => { if (!closing && e.target === e.currentTarget && onClose) onClose(); }}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="ls-dialog" ref={boxRef} tabIndex={-1} style={{ maxWidth: "min(" + width + "px, calc(100vw - var(--space-8)))" }} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}>
        <div className="ls-dialog__head">
          <div>
            {eyebrow ? <div className="ls-dialog__eyebrow">{eyebrow}</div> : null}
            {title ? <div className="ls-dialog__title" id={titleId}>{title}</div> : null}
          </div>
          {onClose ? <button type="button" className="ls-dialog__x" aria-label={closeLabel} onClick={onClose}>✕</button> : null}
        </div>
        <div className="ls-dialog__body">{children}</div>
        {footer ? <div className="ls-dialog__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/* — Progress — */
export interface ProgressProps {
  value?: number; label?: React.ReactNode; detail?: React.ReactNode;
  /** The status hue of the fill. Omit for the accent — the caller knows what
      the threshold means; the bar only shows it. Same names as Badge/Toast. */
  tone?: "positive" | "caution" | "danger";
  thick?: boolean; inverse?: boolean; className?: string; style?: React.CSSProperties;
}

export function Progress({
  value = 0, label, detail, tone, thick = false, inverse = false, className = "", style,
}: ProgressProps) {
  const v = Math.min(100, Math.max(0, value));
  const labelId = React.useId();
  return (
    <div className={cx("ls-progress", tone && "ls-progress--" + tone, thick && "ls-progress--thick", inverse && "ls-progress--inverse", className)} style={style}
      role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}
      aria-labelledby={label ? labelId : undefined} aria-valuetext={typeof detail === "string" ? detail : undefined}>
      {(label || detail) ? (
        <div className="ls-progress__head">
          {label ? <span className="ls-progress__label" id={labelId}>{label}</span> : <span></span>}
          {detail ? <span className="ls-progress__val">{detail}</span> : null}
        </div>
      ) : null}
      <div className="ls-progress__track"><div className="ls-progress__fill" style={{ width: v + "%" }}></div></div>
    </div>
  );
}

/* — StateBlock — */
const STATE_DEFAULTS: Record<string, { icon?: IconName; title: string; detail: string }> = {
  empty: { icon: "Inbox", title: "Nothing here yet.", detail: "When there's something to show, it shows here." },
  /* This default renders on EVERY loading state in the product, so it cannot
     name one surface: a manifest is the boarding list for a single episode,
     and most of what loads here is not that. */
  loading: { title: "Hauling it in.", detail: "A moment — the page is loading." },
  /* The member error boundary's own wording, adopted as the default so the
     generic block and the boundary say the same thing. See
     src/app/(member)/error.tsx — no apology, no blame, and the reference is
     what Shoreside needs to find it. */
  error: { icon: "CloudLightning", title: "That didn't land.", detail: "Our end, not yours. Try again — if it holds, hail Shoreside and quote the reference." },
  offline: { icon: "WifiOff", title: "No signal past the breakwater.", detail: "You're offline. What you've loaded keeps working; changes sync when you're back." },
  /* The receipt: a form went through, an export is ready, a transfer landed.
     Positive tone. The pair to the error default above — that one didn't
     land, this one did. */
  done: { icon: "CircleCheck", title: "That landed.", detail: "" },
};

/* `status="done"` is the success state — the positive counterpart of `error`,
   announced as a status rather than an alert. Its default detail is empty on
   purpose: what was done is the caller's sentence. */
export interface StateBlockProps {
  status?: "empty" | "loading" | "error" | "offline" | "done"; title?: React.ReactNode; detail?: React.ReactNode;
  action?: React.ReactNode;
  /** Overrides the status's own glyph. The set icon-set.ts ships, not a
      string — the agreements page asked for a name Lucide does not export and
      drew a blank 26px square above its title for weeks. */
  icon?: IconName;
  bare?: boolean; className?: string; style?: React.CSSProperties;
}

export function StateBlock({
  status = "empty", title, detail, action, icon, bare = false, className = "", style,
}: StateBlockProps) {
  const d = STATE_DEFAULTS[status] || STATE_DEFAULTS.empty;
  const body = detail || d.detail;
  return (
    <div className={cx("ls-state", "ls-state--" + status, bare && "ls-state--bare", className)} style={style}
      role={status === "error" ? "alert" : "status"} aria-busy={status === "loading"}>
      {status === "loading"
        ? <div className="ls-state__bar"><div></div></div>
        : (icon || d.icon) ? <span className="ls-state__icon"><Icon name={icon || d.icon!} size={26} /></span> : null}
      <div className="ls-state__title">{title || d.title}</div>
      {body ? <div className="ls-state__detail">{body}</div> : null}
      {action ? <div className="ls-state__act">{action}</div> : null}
    </div>
  );
}

/* — Notice —
   The inline alert: a ruled block that sits in the flow of a page or under a
   form and says what just happened or what to know before acting — a refusal
   under a submit, a receipt after one, a hold on an account, a note on a
   closed thread. Not a Toast (which floats and leaves) and not a StateBlock
   (which stands in for content that is not there).

     <Notice tone="danger">That card was declined. Nothing was charged.</Notice>
     <Notice tone="positive" title="Sent">The code is on its way.</Notice>

   Role is derived from tone unless given: danger and warn are announced at
   once (alert), everything else waits its turn (status). Pass `role={undefined}`
   explicitly to render without one — for a notice that is present on load
   and would otherwise be read out as news. `compact` tightens it to one line
   of --text-xs for a note under a field. */
export type NoticeProps = {
  tone?: "info" | "positive" | "warn" | "danger" | "neutral";
  title?: React.ReactNode; compact?: boolean;
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function Notice({
  tone = "neutral", title, compact = false, className = "", style, children, ...rest
}: NoticeProps) {
  const role = "role" in rest ? rest.role : tone === "danger" || tone === "warn" ? "alert" : "status";
  return (
    <div
      {...rest}
      role={role}
      className={cx("ls-notice", "ls-notice--" + tone, compact && "ls-notice--compact", className)}
      style={style}
    >
      {title ? <div className="ls-notice__title">{title}</div> : null}
      {children != null ? <div className="ls-notice__body">{children}</div> : null}
    </div>
  );
}

/* — Toast —
   `duration` auto-dismisses: after that many milliseconds the toast plays its
   exit and then calls `onClose`. The × button calls `onDismiss` at once (the
   contract every existing caller has) and, when `onClose` is given, also
   plays the exit and calls it after. `open` lets the parent drive the exit
   the way Dialog's does — set it false and the toast leaves rather than
   vanishing; the parent unmounts it from `onClose`.

   The exit is Dialog's: the prop change (or the timer, or the ×) puts the
   toast in a `closing` phase, the --out class runs the exit keyframes, and
   animationend ends the phase. A safety timer covers an animationend that
   never fires. Nothing here reads a clock in render. */
interface ToastBase {
  message: React.ReactNode; meta?: React.ReactNode; tone?: "ink" | "positive" | "caution" | "danger";
  fixed?: boolean;
  /** The × was pressed. Called immediately, before any exit. */
  onDismiss?: () => void;
  dismissLabel?: string; className?: string; style?: React.CSSProperties;
}

/* `open` and `duration` are the two ways to ASK the toast to leave, and
   `onClose` is the only way the parent hears that it did. Without it the
   toast plays its exit, renders nothing, and stays mounted forever inside a
   conditional the parent never re-evaluates — which is the shape every one of
   the 55 call sites had before Wave 3, and it is why the exit was dead code.
   So the two are one option, not three: a managed toast names its `onClose`
   and may set either trigger; an unmanaged one takes neither trigger, and its
   × is the parent's own business through `onDismiss`.

   (`onDismiss` is NOT in the union. It composes with both: on a managed toast
   the × calls it at once and then plays the exit before `onClose`. That is the
   documented contract and it is what the kit's own test asserts.) */
interface ToastManaged extends ToastBase {
  /** Set false to play the exit; unmount from `onClose`. */
  open?: boolean;
  /** Milliseconds before the toast leaves on its own. Omit to hold. */
  duration?: number;
  /** The toast has finished leaving — by timer, by ×, or by `open` going false. */
  onClose: () => void;
}

interface ToastUnmanaged extends ToastBase {
  open?: never;
  duration?: never;
  onClose?: never;
}

export type ToastProps = ToastManaged | ToastUnmanaged;

export function Toast({
  message, meta, tone = "ink", fixed = false, open = true, duration, onDismiss, onClose, dismissLabel = "Dismiss", className = "", style,
}: ToastProps) {
  /* A fixed toast is z-index 1100 and the member tab bar is 300, and the bar
     still won: pages wrapped in `.ls-fade` (an animation, so a stacking
     context) trapped the toast inside it. On /live that made
     "Order placed — the galley has it. Charged to your account." invisible
     behind the bar, and tapping the toast's ✕ navigated to the Word tab.
     Portalled like Dialog, for the same reason. */
  const mounted = useMounted();

  /* The exit is useExitPhase, the same phase Dialog and the four overlays run.
     `onClosed` carries the caller's `onClose` so it fires once at the end of
     the exit however the phase ended, and `close` is the trigger the clock and
     the × reach for — a toast is the one surface that decides to leave on its
     own rather than being told to by a prop. */
  const { present, closing, onAnimationEnd, close } = useExitPhase(open, { onClosed: onClose });
  /* The clock. Armed on mount and whenever `duration` changes; a toast whose
     message changes keeps its original deadline, which is what a caller who
     updates "Saving…" to "Saved" expects. */
  React.useEffect(() => {
    if (!duration || !open) return;
    const t = window.setTimeout(close, duration);
    return () => window.clearTimeout(t);
  }, [duration, open, close]);

  /* The visible toast is not the live region — it is created with its text
     already inside it, which announces unreliably. It writes into the standing
     one in the root layout instead, and drops the role so nothing is read
     twice. */
  const msgRef = React.useRef<HTMLSpanElement>(null);
  const saidRef = React.useRef<string | null>(null);
  /* Which region this toast spoke into, for the cleanup to clear the same one. */
  const regionRef = React.useRef<string>("ls-announcer");
  /* The standing regions live in the root layout. Rendered anywhere without
     them — a storybook, a test, a stray route outside the shell — the toast
     becomes its own live region rather than saying nothing. */
  const [ownRole, setOwnRole] = React.useState<"status" | "alert" | undefined>(undefined);
  React.useEffect(() => {
    /* A refusal is read at once; a receipt waits its turn. */
    regionRef.current = tone === "danger" ? "ls-announcer-alert" : "ls-announcer";
    setOwnRole(document.getElementById(regionRef.current) ? undefined : tone === "danger" ? "alert" : "status");
  }, [tone]);
  /* No dependency array on purpose. `message` is a ReactNode at half the call
     sites, so it has a new identity on every parent render; keying the effect
     on it would clear and refill the region each time and read the same
     sentence out over and over. The guard is the text itself. */
  React.useEffect(() => {
    const region = document.getElementById(regionRef.current);
    const text = msgRef.current?.textContent?.trim();
    if (!region || !text || text === saidRef.current) return;
    saidRef.current = text;
    region.textContent = text;
  });
  React.useEffect(
    () => () => {
      const region = document.getElementById(regionRef.current);
      if (region && saidRef.current && region.textContent === saidRef.current) region.textContent = "";
    },
    []
  );

  if (!present) return null;

  const dismiss = () => {
    onDismiss?.();
    if (onClose) close();
  };

  const node = (
    <div
      className={cx("ls-toast", "ls-toast--" + tone, fixed && "ls-toast--fixed", closing && "ls-toast--out", className)}
      style={style} role={ownRole} aria-hidden={closing || undefined}
      onAnimationEnd={onAnimationEnd}
    >
      <span className="ls-toast__rule"></span>
      <span ref={msgRef}>{message}</span>
      {meta ? <span className="ls-toast__meta">{meta}</span> : null}
      {onDismiss || onClose ? <button type="button" className="ls-toast__x" aria-label={dismissLabel} onClick={dismiss}>✕</button> : null}
    </div>
  );

  if (!fixed) return node;
  return mounted ? createPortal(node, document.body) : null;
}

/* — Skeleton —
   The shape of what is coming, holding the space it will take.

   Nothing in the kit held layout while data loaded, so every surface that
   fetches its own rows either replaced a whole region with a centred bar
   (StateBlock status="loading") or returned null and popped its content in
   afterwards. Both are reflows, and a reader reads a reflow as the page having
   changed its mind about what it was showing.

     <Skeleton lines={3} />                    three lines of body copy
     <Skeleton height="var(--control-md)" />   the button that is about to land
     <Skeleton rounded width="40px" height="40px" />   an avatar

   `lines` is how many blocks; the last of several is short, the way a
   paragraph ends. `width` and `height` are handed straight to the blocks so a
   caller can reserve exactly the box the real thing will occupy — pass a token
   (`var(--control-md)`) rather than a number wherever one exists.

   aria-hidden, always. There is nothing here to announce and no reader should
   hear a placeholder described; the region that owns the skeleton carries the
   aria-busy that says something is on its way. Under prefers-reduced-motion the
   sweep stops and the block rests as a flat wash — see components.css. */
export interface SkeletonProps {
  /** How many blocks. More than one and the last is short, like a paragraph. */
  lines?: number;
  /** Width of each block — any CSS length. Defaults to the full column. */
  width?: string;
  /** Height of each block. Defaults to one line of body copy. */
  height?: string;
  /** Fully round the corners — an avatar, a pill, a dot. */
  rounded?: boolean;
  className?: string; style?: React.CSSProperties;
}

export function Skeleton({
  lines = 1, width, height, rounded = false, className = "", style,
}: SkeletonProps) {
  const n = Math.max(1, Math.floor(lines));
  return (
    <span
      className={cx("ls-skel", rounded && "ls-skel--round", className)}
      style={style}
      aria-hidden="true"
    >
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="ls-skel__line" style={{ width, height }} />
      ))}
    </span>
  );
}

/* — Tooltip —
   Shown on hover and on focus-within (CSS), so the child has to be focusable
   for a keyboard reader to reach it — wrap a Button or an IconButton, not a
   bare span. The bubble is wired to the child with aria-describedby when the
   child is a single element, and Escape hides it until the pointer or focus
   leaves (WCAG 1.4.13: dismissible).

   Escape was bound with onKeyDown on this wrapper, which means it only ever
   fired when focus was already inside — the keyboard case, which is the one
   that needed it least. The pointer case is the one 1.4.13 is written for: a
   bubble hovered into existence over the thing you were reading, with focus
   somewhere else entirely and nowhere for a keystroke to land. The bubble is
   pointer-events:none as well, so it could not even be hovered away. The
   listener sits on the document for the life of the component instead, so
   Escape dismisses it from wherever the reader happens to be. */
export interface TooltipProps {
  label: React.ReactNode; side?: "top" | "bottom";
  className?: string; style?: React.CSSProperties; children?: React.ReactNode;
}

export function Tooltip({
  label, side = "top", className = "", style, children,
}: TooltipProps) {
  const id = React.useId();
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHidden(true); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const child = React.isValidElement<{ "aria-describedby"?: string }>(children)
    ? React.cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" ") })
    : children;
  return (
    <span
      className={cx("ls-tip", side === "bottom" && "ls-tip--bottom", hidden && "ls-tip--hidden", className)}
      style={style}
      onMouseEnter={() => setHidden(false)}
      onMouseLeave={() => setHidden(false)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHidden(false); }}
    >
      {child}
      <span className="ls-tip__bubble" role="tooltip" id={id}>{label}</span>
    </span>
  );
}
