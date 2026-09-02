"use client";

import React from "react";
import { writeToShoreside, type ThreadResult } from "@/app/(member)/threads/actions";

/* The door to the concierge desk. One live Shoreside thread per member — the
   action opens it or rejoins it, and lands the member inside either way. */
export function WriteToShoreside({ className }: { className?: string }) {
  const [state, formAction, pending] = React.useActionState<ThreadResult, FormData>(
    writeToShoreside,
    {}
  );
  return (
    <form action={formAction} className={className}>
      <button type="submit" className="ls-btn ls-btn--outline ls-btn--sm" disabled={pending}>
        Write to Shoreside
      </button>
      {state.error ? (
        /* alert, not status — a refusal interrupts; see enquire.tsx. */
        <p className="hm-note" role="alert" style={{ marginTop: 8 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
