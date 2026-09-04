"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Dockside: the gangway screen must never dead-end the crew. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="hm-shell" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="hm-eyebrow">Something broke</span>
      <h1 style={{ marginTop: 12 }}>The gangway lost the signal.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Stamps already taken are held on this device and flush when the connection returns. Try again, or board by hand and stamp them after.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/gangway">Back to the gangway</Link>
      </p>
      {error.digest ? <p className="hm-mono" style={{ marginTop: 24, fontSize: 12 }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
