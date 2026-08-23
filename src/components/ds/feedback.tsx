"use client";
import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

/* — Dialog — */
export function Dialog({
  open, onClose, eyebrow, title, children, footer, width = 520, closeLabel = "Close",
}: {
  open: boolean; onClose?: () => void; eyebrow?: React.ReactNode; title?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; width?: number; closeLabel?: string;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  /* useSyncExternalStore rather than a setState in an effect: the server
     snapshot is false and the client's is true, which is exactly the
     "am I mounted?" question a portal needs, without a render-then-set. */
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && onClose) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (boxRef.current) boxRef.current.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  /* Portalled to the document root. The veil is z-index 1000 and the member
     tab bar is 300, but z-index only orders siblings within a stacking
     context — rendered in place, the dialog sat inside one the tab bar was not
     part of, and the bar painted straight over the footer. On a phone that put
     the tab bar on top of "CONFIRM YOUR PASS", and with body overflow hidden
     there was no way to scroll it clear: nobody on a phone could book a pass.

     Mounted state, because a portal has no document to aim at on the server. */
  if (!open || !mounted) return null;
  return createPortal(
    <div className="ls-dialog-veil" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="ls-dialog" ref={boxRef} tabIndex={-1} style={{ maxWidth: "min(" + width + "px, calc(100vw - 32px))" }} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
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
export function Progress({
  value = 0, label, detail, thick = false, inverse = false, className = "", style,
}: { value?: number; label?: React.ReactNode; detail?: React.ReactNode; thick?: boolean; inverse?: boolean; className?: string; style?: React.CSSProperties }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={["ls-progress", thick ? "ls-progress--thick" : "", inverse ? "ls-progress--inverse" : "", className].filter(Boolean).join(" ")} style={style}
      role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={typeof label === "string" ? label : undefined}>
      {(label || detail) ? (
        <div className="ls-progress__head">
          {label ? <span className="ls-progress__label">{label}</span> : <span></span>}
          {detail ? <span className="ls-progress__val">{detail}</span> : null}
        </div>
      ) : null}
      <div className="ls-progress__track"><div className="ls-progress__fill" style={{ width: v + "%" }}></div></div>
    </div>
  );
}

/* — StateBlock — */
const STATE_DEFAULTS: Record<string, { icon?: string; title: string; detail: string }> = {
  empty: { icon: "Waves", title: "Nothing on the water.", detail: "When there's something to show, it shows here." },
  loading: { title: "Hauling it in.", detail: "A moment — the manifest is loading." },
  error: { icon: "CloudLightning", title: "That didn't land.", detail: "Something broke on our side. Try again; if it holds, hail Shoreside." },
  offline: { icon: "WifiOff", title: "No signal past the breakwater.", detail: "You're offline. What you've loaded keeps working; changes sync when you're back." },
};

export function StateBlock({
  status = "empty", title, detail, action, icon, bare = false, className = "", style,
}: {
  status?: "empty" | "loading" | "error" | "offline"; title?: React.ReactNode; detail?: React.ReactNode;
  action?: React.ReactNode; icon?: string; bare?: boolean; className?: string; style?: React.CSSProperties;
}) {
  const d = STATE_DEFAULTS[status] || STATE_DEFAULTS.empty;
  return (
    <div className={["ls-state", "ls-state--" + status, bare ? "ls-state--bare" : "", className].filter(Boolean).join(" ")} style={style}
      role={status === "error" ? "alert" : "status"} aria-busy={status === "loading"}>
      {status === "loading"
        ? <div className="ls-state__bar"><div></div></div>
        : (icon || d.icon) ? <span className="ls-state__icon"><Icon name={icon || d.icon!} size={26} /></span> : null}
      <div className="ls-state__title">{title || d.title}</div>
      <div className="ls-state__detail">{detail || d.detail}</div>
      {action ? <div className="ls-state__act">{action}</div> : null}
    </div>
  );
}

/* — Toast — */
const TOAST_TONES: Record<string, string> = {
  ink: "var(--brass-bright)", laurel: "var(--laurel)", clay: "var(--terracotta)", siren: "var(--siren)",
};

export function Toast({
  message, meta, tone = "ink", fixed = false, onDismiss, dismissLabel = "Dismiss", className = "", style,
}: {
  message: React.ReactNode; meta?: React.ReactNode; tone?: "ink" | "positive" | "caution" | "danger";
  fixed?: boolean; onDismiss?: () => void; dismissLabel?: string; className?: string; style?: React.CSSProperties;
}) {
  /* A fixed toast is z-index 1100 and the member tab bar is 300, and the bar
     still won: pages wrapped in `.ls-fade` (an animation, so a stacking
     context) trapped the toast inside it. On /live that made
     "Order placed — the galley has it. Charged to your account." invisible
     behind the bar, and tapping the toast's ✕ navigated to the Word tab.
     Portalled like Dialog, for the same reason. */
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const node = (
    <div className={["ls-toast", fixed ? "ls-toast--fixed" : "", className].filter(Boolean).join(" ")} style={style} role="status" aria-live="polite">
      <span className="ls-toast__rule" style={{ background: TOAST_TONES[tone] || TOAST_TONES.ink }}></span>
      <span>{message}</span>
      {meta ? <span className="ls-toast__meta">{meta}</span> : null}
      {onDismiss ? <button type="button" className="ls-toast__x" aria-label={dismissLabel} onClick={onDismiss}>✕</button> : null}
    </div>
  );

  if (!fixed) return node;
  return mounted ? createPortal(node, document.body) : null;
}

/* — Tooltip — */
export function Tooltip({
  label, side = "top", className = "", style, children,
}: { label: React.ReactNode; side?: "top" | "bottom"; className?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <span className={["ls-tip", side === "bottom" ? "ls-tip--bottom" : "", className].filter(Boolean).join(" ")} style={style}>
      {children}
      <span className="ls-tip__bubble" role="tooltip">{label}</span>
    </span>
  );
}
