"use client";

import React from "react";
import { Button } from "@/components/ds";
import { mintCredential } from "./actions";

/* The rotating face of the member card.

   Two things this component deliberately does NOT do.

   It does not count down to a decision. The countdown is a courtesy so the
   holder knows the code is about to change; nothing here decides whether a
   credential is live. That is verify_member_qr() reading expires_at off the
   row, and a browser tab left open in a pocket cannot vote on it.

   It does not mint on mount without being asked when the tab is hidden. A
   member card open in a background tab minting a fresh row every sixty seconds
   for eight hours is 480 rows nobody looked at, and the sweep only runs when
   the same member asks for a credential — so the table grows until the next
   time they open the card. */
export function Credential({ initialQr, initialExpiry }: { initialQr: string | null; initialExpiry: string | null }) {
  const [qr, setQr] = React.useState(initialQr);
  const [expiry, setExpiry] = React.useState(initialExpiry);
  const [error, setError] = React.useState<string | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);

  const rotate = React.useCallback(async () => {
    const res = await mintCredential();
    if (res.error) {
      setError(res.error);
      return;
    }
    setError(null);
    setQr(res.qr ?? null);
    setExpiry(res.expiresAt ?? null);
  }, []);

  /* One interval, and it stands down while the tab is hidden. */
  React.useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive || document.visibilityState !== "visible") return;
      void rotate();
    };
    const id = setInterval(tick, 55_000);
    const onShow = () => {
      if (document.visibilityState === "visible") void rotate();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [rotate]);

  /* Seconds left, rendered client-side only after mount so the server and the
     browser never disagree about what "now" was. */
  React.useEffect(() => {
    if (!expiry) return;
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round((new Date(expiry).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiry]);

  return (
    <div className="std-cred">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URI raster, no next/image benefit
        <img src={qr} alt="Your member credential" width={164} height={164} className="std-cred__qr" />
      ) : (
        <div className="std-cred__blank" aria-hidden="true" />
      )}
      <div className="std-cred__side">
        <span className="std-cred__label">Digital credential</span>
        <p className="std-cred__line">
          This code changes every 60 seconds while you are online. The one
          printed on your card does not, and both are checked at the gangway.
        </p>
        <span className="std-cred__clock" aria-live="off">
          {left == null ? "Live" : left > 0 ? `${left}s` : "Rotating"}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void rotate()}>
          New code
        </Button>
        {error ? (
          <p className="std-cred__err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
