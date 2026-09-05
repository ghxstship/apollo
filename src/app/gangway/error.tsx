"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MAILBOX } from "@/lib/brand";

/* The sign-in's boundary. It used to carry the crew check-in's copy — stamps
   held on the device, board by hand — on a page where the only thing a
   visitor can do is ask for a link. */
/* Global classes only, as src/app/error.tsx: this boundary renders where
   bridge.css does not load, and .hm-eyebrow and .hm-mono drew nothing here. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="ls-eyebrow" style={{ display: "block", color: "var(--gold-deep)" }}>Something broke</span>
      <h1 style={{ marginTop: 12 }}>The gangway lost the signal.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>Our end, not yours. Try again — if it holds, write to Shoreside and quote the reference.</p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/gangway">Back to the gangway</Link>
        <a className="ls-btn ls-btn--ghost" href={`mailto:${MAILBOX.shore}`}>Write to Shoreside</a>
      </p>
      {error.digest ? <p className="ls-mono-data" style={{ marginTop: 24, color: "var(--text-3)" }}>REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
