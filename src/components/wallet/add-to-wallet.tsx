"use client";

import React from "react";
import { LinkButton, cx, useClientSnapshot } from "@/components/ds";
import "./wallet.css";

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
   navigates. They are the kit's LinkButton marked `external`, so it renders
   a plain <a> rather than next/link: a route handler is not a page, and a
   Link would prefetch it — minting a pass on every viewport entry.

   Apple Wallet lives on iPhone, iPad and Mac; on Android a .pkpass has no
   home, so that link is not offered there. Google Wallet saves from any
   signed-in browser, so it is offered wherever it is configured. */

type Status = { apple: boolean; google: boolean };

/* The platform is an external fact, not React state — read it as a store so
   the server renders neither link and the client settles it on hydration. The
   constant subscribe lives in the kit now — see ds/use-mounted. */
function useAndroid(): boolean {
  return useClientSnapshot(() => /Android/i.test(navigator.userAgent), false);
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

  /* Nothing while the status is on its way: the row this sits in already
     stands at button height beside Print, so there is nothing to hold open,
     and a spinner for a fetch this small would be louder than the buttons.

     A skeleton was weighed here and refused. It could not be sized: what
     lands is nought, one or two links depending on the platform and on what
     the club has configured, and the commonest answer on an unconfigured
     install is nought — so a placeholder the width of two buttons would be a
     wrong guess more often than a right one, and reserving space that never
     fills is a worse jump than the one it prevents. The links carry ls-fade
     instead, so they arrive rather than appear. */
  if (!status) return null;
  const showApple = status.apple && !android;
  const showGoogle = status.google;
  if (!showApple && !showGoogle) return null;

  return (
    <div className={cx("wl", className)}>
      {showApple ? (
        <LinkButton className="wl__link" variant="outline" size="md" inverse={inverse} external href="/api/wallet/apple" rel="nofollow">
          Add to Apple Wallet
        </LinkButton>
      ) : null}
      {showGoogle ? (
        <LinkButton className="wl__link" variant="outline" size="md" inverse={inverse} external href="/api/wallet/google" rel="nofollow">
          Save to Google Wallet
        </LinkButton>
      ) : null}
    </div>
  );
}
