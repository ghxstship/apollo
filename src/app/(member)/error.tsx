"use client";

import Link from "next/link";
import { useEffect } from "react";

/* The member shell's boundary — a failing manifest query lands here, not on Next's stock page. */
/* Global classes only, as src/app/error.tsx: this boundary renders where
   bridge.css does not load, and .hm-eyebrow and .hm-mono drew nothing here. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="ls-eyebrow" style={{ display: "block", color: "var(--gold-deep)" }}>Something broke</span>
      <h1 style={{ marginTop: 12 }}>That didn&rsquo;t land.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Our end, not yours. Try again — if it holds, hail Shoreside and quote the reference.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/support">Hail Shoreside</Link>
      </p>
      {error.digest ? <p className="ls-mono-data" style={{ marginTop: 24, color: "var(--text-3)" }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
