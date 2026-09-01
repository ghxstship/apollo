"use client";

import React from "react";

/* Shared client-side bits for the console — toast state and mono time. */

export type ToastMsg = {
  msg: string;
  meta?: string;
  tone?: "ink" | "positive" | "caution" | "danger";
};

/* A receipt stands four seconds; a refusal six, because it is the one the
   reader has to act on. Either holds still while the pointer is over it or
   focus is inside it (WCAG 2.2.1 — a timed message must be pausable), and
   the clock starts over when they leave. */
const TOAST_MS = 4000;
const DANGER_TOAST_MS = 6000;

export function useToast() {
  const [toast, setToast] = React.useState<ToastMsg | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const ms = toast.tone === "danger" ? DANGER_TOAST_MS : TOAST_MS;
    let h: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (h) clearTimeout(h);
      h = setTimeout(() => setToast(null), ms);
    };
    const hold = () => {
      if (h) clearTimeout(h);
      h = null;
    };
    arm();
    /* The Toast primitive owns its markup and portals it to <body>; this
       hook owns the clock. It reaches the rendered toast by class rather than
       by ref because Toast takes no ref and no event props — and every
       console page renders its toast in the same commit this effect follows,
       so the node is there by the time it looks. */
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".ls-toast--fixed"));
    for (const n of nodes) {
      n.addEventListener("mouseenter", hold);
      n.addEventListener("mouseleave", arm);
      n.addEventListener("focusin", hold);
      n.addEventListener("focusout", arm);
    }
    return () => {
      if (h) clearTimeout(h);
      for (const n of nodes) {
        n.removeEventListener("mouseenter", hold);
        n.removeEventListener("mouseleave", arm);
        n.removeEventListener("focusin", hold);
        n.removeEventListener("focusout", arm);
      }
    };
  }, [toast]);
  const clear = React.useCallback(() => setToast(null), []);
  return { toast, show: setToast, clear };
}

/* Mono-caps relative age for queue rows — "12 MIN AGO", "2D AGO". */
export function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "JUST NOW";
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

export const AVATAR_TONES = ["ink", "sea", "gold", "sand"] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

export function avatarTone(raw: string | null | undefined): AvatarTone {
  return (AVATAR_TONES as readonly string[]).includes(raw ?? "") ? (raw as AvatarTone) : "sand";
}
