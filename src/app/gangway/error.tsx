"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ds";
import { MAILBOX } from "@/lib/brand";

/* The sign-in's boundary. It used to carry the crew check-in's copy — stamps
   held on the device, board by hand — on a page where the only thing a
   visitor can do is ask for a link. */
/* Global classes only, as src/app/error.tsx: this boundary renders where
   bridge.css does not load, and .hm-eyebrow and .hm-mono drew nothing here.
   The kit's utilities (components.css, base.css) load on every route. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container ls-section ls-rise">
      <div className="ls-stack">
        <span className="ls-eyebrow ls-eyebrow--gold">Something broke</span>
        <h1>The gangway lost the signal.</h1>
        <p className="ls-lede">Our end, not yours. Try again — if it holds, write to Shoreside and quote the reference.</p>
        <p className="ls-acts">
          <Button variant="gold" onClick={reset}>Try again</Button>
          <LinkButton variant="ghost" href="/gangway">Back to the gangway</LinkButton>
          <LinkButton variant="ghost" href={`mailto:${MAILBOX.shore}`}>Write to Shoreside</LinkButton>
        </p>
        {error.digest ? <p className="ls-mono-data ls-note">REF {error.digest.toUpperCase()}</p> : null}
      </div>
    </main>
  );
}
