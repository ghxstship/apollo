"use client";

import { useEffect } from "react";

/* Registers the offline shell — the PWA's only service worker.

   The registration failure used to be swallowed by a bare `.catch(() => {})`,
   so an environment where the worker never registers looked identical to one
   where it works: no offline shell, no cache purge on sign-out, and nothing
   said so. It stays best-effort — a member should never see this — but it
   leaves a trace an operator can find. */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[syrius] the offline shell did not register:", err);
    });
  }, []);
  return null;
}
