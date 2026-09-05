"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ds";

/* The Bridge's boundary — the operator gets the reference to quote, not a stack. */
/* A block, not a second shell: this renders INSIDE the layout's <main
   id="main">, so the <main className="hm-shell"> it used to draw was a main
   inside a main with the same id, and a nested shell painting its own ground
   over the console's. The layout keeps the chrome; this is the page. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="hm-err">
      <span className="hm-eyebrow">Something broke</span>
      <h1>The Bridge lost the thread.</h1>
      <p>Our end. Try again; if it holds, the reference below is what engineering needs.</p>
      <p className="hm-err__acts">
        <Button variant="gold" onClick={reset}>Try again</Button>
        <LinkButton variant="ghost" href="/bridge">Back to the Bridge</LinkButton>
      </p>
      {error.digest ? <p className="hm-mono hm-err__ref">REF {error.digest.toUpperCase()}</p> : null}
    </div>
  );
}
