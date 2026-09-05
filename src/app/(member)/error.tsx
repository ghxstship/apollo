"use client";

import Link from "next/link";
import { useEffect } from "react";

/* The member shell's boundary — a failing manifest query lands here, not on Next's stock page. */
/* Global classes only, as src/app/error.tsx: this boundary renders where
   bridge.css does not load, and .hm-eyebrow and .hm-mono drew nothing here.
   member.css DOES load — the boundary renders inside (member)/layout — so the
   page-head rhythm and the .mbr-err block are the ones it wears. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container mbr-err">
      <span className="mbr-eyebrow mbr-eyebrow--block">Something broke</span>
      <h1>That didn&rsquo;t land.</h1>
      <p className="mbr-err__lede">Our end, not yours. Try again — if it holds, hail Shoreside and quote the reference.</p>
      <p className="mbr-err__acts">
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/support">Hail Shoreside</Link>
      </p>
      {error.digest ? <p className="ls-mono-data mbr-err__ref">REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
