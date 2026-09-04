"use client";

import Link from "next/link";
import { useEffect } from "react";

/* The public site's boundary. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="hm-shell" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="hm-eyebrow">Something broke</span>
      <h1 style={{ marginTop: 12 }}>That didn&rsquo;t land.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Our end, not yours. Try again, or write to Shoreside.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/">Home</Link>
      </p>
      {error.digest ? <p className="hm-mono" style={{ marginTop: 24, fontSize: 12 }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
