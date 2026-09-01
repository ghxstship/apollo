"use client";

import { useEffect } from "react";
import { adoptLegacyDeviceStorage } from "@/lib/device-storage";

/* Registers the offline shell — the PWA's only service worker.

   The registration failure used to be swallowed by a bare `.catch(() => {})`,
   so an environment where the worker never registers looked identical to one
   where it works: no offline shell, no cache purge on sign-out, and nothing
   said so. It stays best-effort — a member should never see this — but it
   leaves a trace an operator can find. */
export function SwRegister() {
  useEffect(() => {
    /* Carries over unsent gangway stamps and galley orders from the retired
       key names, and drops stranded rosters — which still hold boarding codes. */
    adoptLegacyDeviceStorage();
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[un] the offline shell did not register:", err);
    });
  }, []);
  return null;
}
