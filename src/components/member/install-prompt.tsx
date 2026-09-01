"use client";

import React from "react";
import { Button } from "@/components/ds";

/* The install offer, on the member's own page and nowhere else.

   Chromium fires `beforeinstallprompt` when the app qualifies; the event is
   kept and replayed on the member's own tap, because the browser refuses a
   prompt() with no gesture behind it. Nothing renders until the event has
   fired, and nothing renders at all when the app is already standing alone
   (display-mode: standalone, or the iOS equivalent) or the member has said
   "not now" — a dismissal is remembered on the device and the offer does not
   come back. No animation: the section simply exists or does not, which is
   also what prefers-reduced-motion asks of it. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "deck-install-dismissed";

function standingAlone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [offer, setOffer] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (standingAlone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* Storage refused (private mode) — offer once, remember nothing. */
    }
    const keep = (e: Event) => {
      e.preventDefault();
      setOffer(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);

  if (!offer) return null;

  const install = async () => {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    /* Either way the browser will not replay this event; the section goes.
       A refusal in the browser's own sheet counts as the member's word. */
    if (outcome === "dismissed") remember();
    setOffer(null);
  };

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      /* No storage — the offer returns next visit, which is the honest fallback. */
    }
  };

  const dismiss = () => {
    remember();
    setOffer(null);
  };

  return (
    <div>
      <div className="you-h">The deck</div>
      <div className="you-sec">
        <div className="you-row">
          <div>
            <b>Add to your deck</b>
            <p>The club on your home screen — no store, no download, works past the breakwater.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" size="sm" onClick={dismiss}>
              Not now
            </Button>
            <Button variant="gold" size="sm" onClick={install}>
              Add to your deck
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
