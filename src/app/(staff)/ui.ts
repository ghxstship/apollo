"use client";

import React from "react";

/* Shared client-side bits for the console — toast state and mono time. */

export type ToastMsg = {
  msg: string;
  meta?: string;
  tone?: "ink" | "positive" | "caution" | "danger";
};

export function useToast() {
  const [toast, setToast] = React.useState<ToastMsg | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(h);
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
