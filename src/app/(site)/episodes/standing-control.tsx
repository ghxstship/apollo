"use client";

import React from "react";
import { Button } from "@/components/ds";
import { saveStandingView } from "./standing";

/* Set once, opens that way from then on.

   The membership move: a member who only sails, or only follows Night Watch,
   should not have to say so on every visit. What makes it safe rather than
   annoying is that the standing view is never invisible — the manifest says it
   is in force, and the way out is the same row as the way in.

   Deliberately not a star or a bookmark icon. This is a sentence about what
   happens next time, and it reads as one. */
export function StandingControl({
  /* The query string as it stands, from the pills. */
  current,
  /* What is stored, or null. */
  standing,
  signedIn,
}: {
  current: string;
  standing: string | null;
  signedIn: boolean;
}) {
  const [saved, setSaved] = React.useState<string | null>(standing);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  /* A signed-out reader is not being sold an account here — the control simply
     is not part of their page. */
  if (!signedIn) return null;

  const matches = (saved ?? "") === current;
  const write = (value: string) => {
    setError(null);
    startTransition(async () => {
      const res = await saveStandingView(value);
      if (res.error) setError(res.error);
      else setSaved(res.saved ?? null);
    });
  };

  return (
    <div className="ws-standing">
      {saved !== null && matches ? (
        <span className="ws-standing__on">Opens this way</span>
      ) : null}
      {!matches ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => write(current)}>
          {current ? "Open this way from now on" : "Stop opening filtered"}
        </Button>
      ) : null}
      {saved !== null && matches ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => write("")}>
          Forget this
        </Button>
      ) : null}
      {error ? (
        <span className="ws-standing__err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
