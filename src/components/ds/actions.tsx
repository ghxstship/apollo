"use client";
import React from "react";
import { Icon } from "./icon";

/* — Button — */
export function Button({
  variant = "primary", size = "md", inverse = false, fullWidth = false,
  disabled = false, type = "button", className = "", children, ...rest
}: {
  variant?: "primary" | "brass" | "outline" | "ghost"; size?: "sm" | "md" | "lg";
  inverse?: boolean; fullWidth?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["ls-btn", "ls-btn--" + variant, "ls-btn--" + size, inverse ? "ls-btn--inverse" : "", fullWidth ? "ls-btn--full" : "", className].filter(Boolean).join(" ");
  return <button type={type} disabled={disabled} className={cls} {...rest}>{children}</button>;
}

/* — IconButton — */
export function IconButton({
  label, variant = "outline", size = "md", inverse = false, disabled = false, className = "", children, ...rest
}: {
  label: string; variant?: "solid" | "outline" | "ghost"; size?: "sm" | "md" | "lg"; inverse?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["ls-iconbtn", "ls-iconbtn--" + variant, "ls-iconbtn--" + size, inverse ? "ls-iconbtn--inverse" : "", className].filter(Boolean).join(" ");
  return <button type="button" aria-label={label} title={label} disabled={disabled} className={cls} {...rest}>{children}</button>;
}

/* — ThemeToggle — */
const THEME_KEY = "lyre-theme";
type ThemeMode = "dark" | "light" | "system";

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  return mode === "system"
    ? (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : mode;
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const actual = resolveTheme(mode);
  if (actual === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

/* The persisted mode lives in localStorage — read it as an external store so
   SSR renders "dark" and the client syncs without a hydration mismatch. */
const THEME_EVENT = "lyre-theme-change";

function subscribeTheme(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(THEME_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(THEME_EVENT, cb);
  };
}

export function ThemeToggle({
  storageKey = THEME_KEY, darkLabel = "Dark theme", lightLabel = "Light theme", systemLabel = "Follow system",
  className = "", style,
}: { storageKey?: string; darkLabel?: string; lightLabel?: string; systemLabel?: string; className?: string; style?: React.CSSProperties }) {
  const mode = React.useSyncExternalStore<ThemeMode>(
    subscribeTheme,
    () => {
      try { return (localStorage.getItem(storageKey) as ThemeMode) || "dark"; } catch { return "dark"; }
    },
    () => "dark"
  );
  const setMode = (next: ThemeMode) => {
    try { localStorage.setItem(storageKey, next); } catch { /* private mode */ }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  React.useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);
  const opts: Array<[ThemeMode, string, string]> = [["dark", "Moon", darkLabel], ["light", "Sun", lightLabel], ["system", "Monitor", systemLabel]];
  return (
    <span className={["ls-themetog", className].filter(Boolean).join(" ")} style={style} role="group" aria-label="Theme">
      {opts.map(([id, ic, label]) => (
        <button key={id} type="button" className={mode === id ? "on" : ""} aria-label={label} aria-pressed={mode === id} title={label} onClick={() => setMode(id)}>
          <Icon name={ic} size={14} />
        </button>
      ))}
    </span>
  );
}
