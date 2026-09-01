"use client";

import Link from "next/link";
import { useEffect } from "react";

/* The Bridge's boundary — the operator gets the reference to quote, not a stack. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="hm-shell" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="hm-eyebrow">Something broke</span>
      <h1 style={{ marginTop: 12 }}>The Bridge lost the thread.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Our end. Try again; if it holds, the reference below is what engineering needs.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="hm-btn hm-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="hm-btn hm-btn--ghost" href="/bridge">Back to the Bridge</Link>
      </p>
      {error.digest ? <p className="hm-mono" style={{ marginTop: 24, fontSize: 12 }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
