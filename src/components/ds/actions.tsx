"use client";
import React from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icon";
import { buttonClass, cx } from "./class";
import { THEME_STORAGE_KEY } from "@/lib/brand";

/* — Button —
   `pending` is the in-flight state of the action the button fires: it sets
   aria-busy, disables the control, and — when `pendingLabel` is given — swaps
   the label for it WITHOUT the button changing width. Both labels are laid in
   the same grid cell and the inactive one is hidden but still measured, so the
   button is as wide as the wider of the two from the first paint and nothing
   beside it moves when the state flips. Without `pendingLabel` the label stays
   and only the state changes.

     <Button pending={busy} pendingLabel="Saving…">Save</Button>

   The base class carries the md size, so a bare `ls-btn` written by hand still
   renders 44px tall — the error pages shipped zero-height buttons when the size
   modifier was forgotten. */
export type ButtonProps = {
  /* `danger` is for a control that destroys or cannot be undone — cancelling a
     sailing, revoking a key, redacting a signature, striking a record. It is
     deliberately an outline at rest so it never competes with the view's one
     accent, and fills only under the pointer. Reach for it whenever the safe
     neighbour in the same row is `outline` or `ghost`. */
  variant?: "primary" | "gold" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg";
  inverse?: boolean; fullWidth?: boolean;
  /** The action is in flight: aria-busy, disabled, label swapped for `pendingLabel` if given. */
  pending?: boolean;
  /** Shown in place of the children while `pending`. Width is reserved for both. */
  pendingLabel?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary", size = "md", inverse = false, fullWidth = false,
  disabled = false, pending = false, pendingLabel, type = "button", className = "", children, ...rest
}: ButtonProps) {
  const cls = buttonClass({ base: "ls-btn", variant, size, inverse, fullWidth, disabled, pending, className });
  return (
    <button type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={cls} {...rest}>
      {pendingLabel == null ? children : (
        <span className="ls-btn__stack">
          <span className="ls-btn__label" aria-hidden={pending || undefined}>{children}</span>
          <span className="ls-btn__alt" aria-hidden={!pending || undefined}>{pendingLabel}</span>
        </span>
      )}
    </button>
  );
}

/* — IconButton —
   `pending` sets aria-busy and disables; `pendingLabel` replaces the accessible
   name while in flight ("Saving" for "Save"). The glyph is the caller's and is
   not swapped — an icon button is one width by construction. */
export type IconButtonProps = {
  label: string; variant?: "solid" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; inverse?: boolean;
  pending?: boolean; pendingLabel?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({
  label, variant = "outline", size = "md", inverse = false, disabled = false, pending = false, pendingLabel, className = "", children, ...rest
}: IconButtonProps) {
  const name = pending && pendingLabel ? pendingLabel : label;
  const cls = buttonClass({ base: "ls-iconbtn", variant, size, inverse, disabled, pending, className });
  return <button type="button" aria-label={name} title={name} disabled={disabled || pending} aria-busy={pending || undefined} className={cls} {...rest}>{children}</button>;
}

/* — LinkButton —
   The anchor-shaped Button: same variants, same sizes, same class contract, for
   a CTA that navigates rather than acts. An in-app href renders next/link; an
   external one (a scheme or a protocol-relative host) renders a plain <a> with
   rel="noopener noreferrer" — set `target` yourself if it should open a new
   tab. Everything else in `...rest` lands on the anchor: aria-label, target,
   download, onClick, id, data-*.

   `disabled` on an anchor is aria-disabled plus the button's faded face and no
   pointer; the href stays so the destination is still discoverable. Use it for
   a placeholder CTA whose gate has not opened, not to hide a route.

   `pending` is Button's, and it is here because it was not: three of the four
   button components had it and this one did not, so a CTA that kicks off a
   navigation nobody has finished paying for had nothing to say about it and
   call sites reached for `disabled` instead — which tells a reader the link is
   unavailable rather than busy. Same class, same swapped label, same reserved
   width. An anchor has no `disabled` attribute, so the click is refused here
   rather than by the UA, and aria-disabled and tabIndex carry the state to
   everything that is not a pointer. */
const EXTERNAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export type LinkButtonProps = {
  href: string;
  variant?: "primary" | "gold" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg";
  inverse?: boolean; fullWidth?: boolean; disabled?: boolean;
  /** The navigation this CTA starts is in flight: aria-busy, the click
      refused, the label swapped for `pendingLabel` if given. */
  pending?: boolean;
  /** Shown in place of the children while `pending`. Width is reserved for both. */
  pendingLabel?: React.ReactNode;
  /** Force a plain <a>. Inferred from the href when omitted. */
  external?: boolean;
  prefetch?: React.ComponentProps<typeof Link>["prefetch"];
  children?: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function LinkButton({
  href, variant = "primary", size = "md", inverse = false, fullWidth = false, disabled = false,
  pending = false, pendingLabel, external, prefetch, className = "", children, rel, ...rest
}: LinkButtonProps) {
  const off = disabled || pending;
  const cls = buttonClass({ base: "ls-btn", variant, size, inverse, fullWidth, disabled, pending, className });
  const isExternal = external ?? EXTERNAL_HREF.test(href);
  const a11y = off
    ? { "aria-disabled": true as const, tabIndex: -1, "aria-busy": pending || undefined }
    : {};
  /* .ls-btn--disabled takes pointer-events away, but the pending face keeps
     them so the progress cursor can be seen — so the navigation is refused
     here rather than by the cascade. In either off state the caller's own
     onClick is replaced, not merely preceded: an anchor that is busy or gated
     should do nothing at all when it is clicked. */
  const onClick = off
    ? (e: React.MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); }
    : rest.onClick;
  const body = pendingLabel == null ? children : (
    <span className="ls-btn__stack">
      <span className="ls-btn__label" aria-hidden={pending || undefined}>{children}</span>
      <span className="ls-btn__alt" aria-hidden={!pending || undefined}>{pendingLabel}</span>
    </span>
  );
  if (isExternal) {
    return <a href={href} className={cls} rel={rel ?? "noopener noreferrer"} {...rest} {...a11y} onClick={onClick}>{body}</a>;
  }
  return <Link href={href} className={cls} prefetch={prefetch} rel={rel} {...rest} {...a11y} onClick={onClick}>{body}</Link>;
}

/* — TextButton —
   A button that reads as text: Show / Hide, Clear, Undo, Resend the code, Sign
   out of everywhere. It is the `ls-bare` reset with a face, so it keeps the
   reset's focus ring and its 44px touch pseudo, and it is the component every
   hand-rolled `<button className="ls-bare">` should become.

     default  ink, underlined like a link — a real action in running copy
     quiet    faint until hovered — a secondary action beside a primary one
     danger   the destructive step in text form (Remove, Revoke) */
export type TextButtonProps = {
  tone?: "default" | "quiet" | "danger"; size?: "sm" | "md";
  pending?: boolean; pendingLabel?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function TextButton({
  tone = "default", size = "md", disabled = false, pending = false, pendingLabel, type = "button", className = "", children, ...rest
}: TextButtonProps) {
  const cls = buttonClass({ base: "ls-textbtn", variant: tone, size, disabled, pending, className });
  return (
    <button type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={cls} {...rest}>
      {pending && pendingLabel != null ? pendingLabel : children}
    </button>
  );
}

/* — ThemeToggle — */
type ThemeMode = "dark" | "light" | "system";

/* Polarity inverted with the rebrand. tokens.css is paper-first — :root is the
   paper palette and [data-theme="dark"] is the ink one — where the previous
   system was dark-first and stamped data-theme="light". So "light" is now the
   absent attribute and "dark" is the present one, and the media query the
   system mode asks is prefers-color-scheme: dark. Left as it was, every reader
   on the default would have been served ink tokens over a paper ground. */
function resolveTheme(mode: ThemeMode): "dark" | "light" {
  return mode === "system"
    ? (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const actual = resolveTheme(mode);
  if (actual === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}

/* The persisted mode lives in localStorage — read it as an external store so
   SSR renders "light" and the client syncs without a hydration mismatch. */
const THEME_EVENT = "un-theme-change";

function subscribeTheme(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(THEME_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(THEME_EVENT, cb);
  };
}

export type ThemeToggleProps = {
  storageKey?: string; darkLabel?: string; lightLabel?: string; systemLabel?: string;
  className?: string; style?: React.CSSProperties;
};

export function ThemeToggle({
  storageKey = THEME_STORAGE_KEY, darkLabel = "Dark theme", lightLabel = "Light theme", systemLabel = "Follow system",
  className = "", style,
}: ThemeToggleProps) {
  const mode = React.useSyncExternalStore<ThemeMode>(
    subscribeTheme,
    () => {
      try { return (localStorage.getItem(storageKey) as ThemeMode) || "light"; } catch { return "light"; }
    },
    () => "light"
  );
  const setMode = (next: ThemeMode) => {
    try { localStorage.setItem(storageKey, next); } catch { /* private mode */ }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  React.useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);
  const opts: Array<[ThemeMode, IconName, string]> = [["dark", "Moon", darkLabel], ["light", "Sun", lightLabel], ["system", "Monitor", systemLabel]];
  return (
    <span className={cx("ls-themetog", className)} style={style} role="group" aria-label="Theme">
      {opts.map(([id, ic, label]) => (
        <button key={id} type="button" className={mode === id ? "on" : ""} aria-label={label} aria-pressed={mode === id} title={label} onClick={() => setMode(id)}>
          <Icon name={ic} size={14} />
        </button>
      ))}
    </span>
  );
}
