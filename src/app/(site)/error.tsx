"use client";

import Link from "next/link";
import { useEffect } from "react";

/* The public site's boundary. It renders inside the site layout, so the nav
   and footer stand and the page head takes the site's own head styles — the
   .hm-* classes it used to carry belong to the Bridge's stylesheet and never
   loaded here. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="ls-container">
      <div className="ws-phead" style={{ paddingBottom: 96 }}>
        <span className="ls-eyebrow">Something broke</span>
        <h1>That didn&rsquo;t land.</h1>
        <p className="ws-phead__sub">
          Our end, not yours. Try again, or write to Shoreside and quote the
          reference below.
        </p>
        <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button className="ls-btn ls-btn--gold" onClick={reset} type="button">
            Try again
          </button>
          <Link className="ls-btn ls-btn--ghost" href="/support">
            Hail Shoreside
          </Link>
        </p>
        {error.digest ? (
          <p className="ls-mono-data" style={{ marginTop: 24, color: "var(--text-3)" }}>
            REF {error.digest.toUpperCase()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
