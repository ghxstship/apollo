"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Dockside: a reload may be impossible offline, so the door stays usable and says what to do. */
/* Global classes only, as src/app/error.tsx: this boundary renders where
   bridge.css does not load, and .hm-eyebrow and .hm-mono drew nothing here. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="ls-eyebrow" style={{ display: "block", color: "var(--gold-deep)" }}>Something broke</span>
      <h1 style={{ marginTop: 12 }}>The kiosk lost the signal.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Check-ins you have already stamped are held on this device and go up when the bars come back. Tap Try again, or wave a member through by hand and stamp them later.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/kiosk">Back to the door</Link>
      </p>
      {error.digest ? <p className="ls-mono-data" style={{ marginTop: 24, color: "var(--text-3)" }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
