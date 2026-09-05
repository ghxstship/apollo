"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ds";

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
      <div className="ws-phead ws-phead--solo">
        <span className="ls-eyebrow">Something broke</span>
        <h1>That didn&rsquo;t land.</h1>
        <p className="ws-phead__sub">
          Our end, not yours. Try again, or write to Shoreside and quote the
          reference below.
        </p>
        {/* Both controls used to be hand-written ls-btn strings that had lost
            their size class and rendered as bare pills; the kit's Button carries
            the md size in its base class, so that cannot recur. */}
        <p className="ws-phead__cta">
          <Button variant="gold" onClick={reset}>
            Try again
          </Button>
          <LinkButton variant="ghost" href="/support">
            Hail Shoreside
          </LinkButton>
        </p>
        {error.digest ? (
          <p className="ls-mono-data ws-phead__ref">
            REF {error.digest.toUpperCase()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
