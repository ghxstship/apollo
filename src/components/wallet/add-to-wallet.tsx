"use client";

import React from "react";

/* Add-to-wallet — two links, or nothing.

   Renders only what /api/wallet/status says this deployment can issue: the
   Apple pass, the Google pass, both, or — until the owner has supplied the
   certificates — nothing at all, so the card page never offers a button that
   answers with a refusal. The check is a fetch on mount rather than a server
   prop so this component can sit inside a page another module owns without
   that page having to know how a wallet is configured.

   Plain anchors, not buttons. /api/wallet/apple answers with a .pkpass the
   browser hands to Wallet, and /api/wallet/google answers with a redirect to
   the Save sheet — both are navigations, and an anchor is the element that
   navigates. They wear the design system's button classes, as the not-found
   page's links do.

   Apple Wallet lives on iPhone, iPad and Mac; on Android a .pkpass has no
   home, so that link is not offered there. Google Wallet saves from any
   signed-in browser, so it is offered wherever it is configured. */

type Status = { apple: boolean; google: boolean };

/* The platform is an external fact, not React state — read it as a store so
   the server renders neither link and the client settles it on hydration. */
const NO_SUBSCRIBE = () => () => {};

function useAndroid(): boolean {
  return React.useSyncExternalStore<boolean>(
    NO_SUBSCRIBE,
    () => /Android/i.test(navigator.userAgent),
    () => false
  );
}

export function AddToWallet({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const android = useAndroid();

  React.useEffect(() => {
    let live = true;
    fetch("/api/wallet/status", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Status>) : null))
      .then((s) => {
        if (live && s) setStatus(s);
      })
      .catch(() => {
        /* No status, no buttons — the same as unconfigured. */
      });
    return () => {
      live = false;
    };
  }, []);

  if (!status) return null;
  const showApple = status.apple && !android;
  const showGoogle = status.google;
  if (!showApple && !showGoogle) return null;

  const cls = ["ls-btn", "ls-btn--outline", "ls-btn--md", inverse ? "ls-btn--inverse" : ""].filter(Boolean).join(" ");

  return (
    <div className={className} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
      {showApple ? (
        <a className={cls} href="/api/wallet/apple" rel="nofollow">
          Add to Apple Wallet
        </a>
      ) : null}
      {showGoogle ? (
        <a className={cls} href="/api/wallet/google" rel="nofollow">
          Save to Google Wallet
        </a>
      ) : null}
    </div>
  );
}
