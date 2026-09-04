"use client";

import React from "react";
import { Button } from "@/components/ds";
import { mintCredential } from "../../membership/standing/actions";

/* The member's rotating credential, on the stub. Same mint as the Standing
   page — issue_member_qr() writes a sixty-second row and the gangway reads its
   clock — so a screenshot of this square is dead before it reaches the door.
   The static boarding code stays on GUEST stubs only, where there is no
   account to mint against. */
export function RotatingCode({
  initialQr,
  initialExpiry,
}: {
  initialQr: string | null;
  initialExpiry: string | null;
}) {
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

  /* One interval, standing down while the tab is hidden; a fresh mint the
     moment it is shown again, which is the moment at the gangway. */
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

  React.useEffect(() => {
    if (!expiry) return;
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.round((new Date(expiry).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiry]);

  return (
    <div className="stb-rot">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URI raster, no next/image benefit
        <img src={qr} alt="Your boarding code" width={168} height={168} className="stb-rot__qr" />
      ) : (
        <div className="stb-rot__blank" aria-hidden="true" />
      )}
      <span className="stb-rot__clock" aria-live="off">
        {left == null ? "Rotates every minute" : left > 0 ? `Rotates in ${left}s` : "Rotating"}
      </span>
      <Button size="sm" variant="ghost" inverse onClick={() => void rotate()}>
        New code
      </Button>
      {error ? (
        <p className="stb-rot__err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
