"use client";

import Link from "next/link";
import { useEffect } from "react";

/* Any throw on the server that is not a 404 lands here. Without this file it
   was Next's stock error page — the digest and nothing else. A member does not
   need the digest; the operator reading the logs does, so it stays visible but
   quiet.

   Global classes only: this boundary can render under any route group, and it
   carried .hm-* classes that only the Bridge's stylesheet defines. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="ls-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="ls-eyebrow" style={{ display: "block", color: "var(--gold-deep)" }}>
        Something broke
      </span>
      <h1 style={{ marginTop: 12 }}>That didn&rsquo;t land.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>
        Our end, not yours. Try again — if it keeps happening, hail Shoreside
        and quote the reference below.
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
    </main>
  );
}
