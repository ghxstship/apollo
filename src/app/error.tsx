"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ds";
import "./boundary.css";

/* Any throw on the server that is not a 404 lands here. Without this file it
   was Next's stock error page — the digest and nothing else. A member does not
   need the digest; the operator reading the logs does, so it stays visible but
   quiet.

   Global classes only: this boundary can render under any route group, and it
   carried .hm-* classes that only the Bridge's stylesheet defines. The page
   rhythm comes from boundary.css, which this file imports itself. */
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
    <main id="main" className="ls-container ls-rise rb-page">
      <span className="ls-eyebrow ls-eyebrow--gold rb-page__eyebrow">Something broke</span>
      <h1>That didn&rsquo;t land.</h1>
      <p className="rb-page__sub">
        Our end, not yours. Try again — if it keeps happening, hail Shoreside
        and quote the reference below.
      </p>
      <p className="rb-page__cta">
        <Button variant="gold" onClick={reset}>
          Try again
        </Button>
        <LinkButton variant="ghost" href="/support">
          Hail Shoreside
        </LinkButton>
      </p>
      {error.digest ? (
        <p className="ls-mono-data rb-page__ref">REF {error.digest.toUpperCase()}</p>
      ) : null}
    </main>
  );
}
