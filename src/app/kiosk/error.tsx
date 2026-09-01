"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Dockside: a reload may be impossible offline, so the door stays usable and says what to do. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="hm-shell" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="hm-eyebrow">Something broke</span>
      <h1 style={{ marginTop: 12 }}>The kiosk lost the signal.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Check-ins you have already stamped are held on this device and go up when the bars come back. Tap Try again, or wave a member through by hand and stamp them later.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="hm-btn hm-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="hm-btn hm-btn--ghost" href="/kiosk">Back to the door</Link>
      </p>
      {error.digest ? <p className="hm-mono" style={{ marginTop: 24, fontSize: 12 }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
