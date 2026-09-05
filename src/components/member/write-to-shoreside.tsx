"use client";

import React from "react";
import { writeToShoreside, type ThreadResult } from "@/app/(member)/threads/actions";
import { Button, Notice } from "@/components/ds";

/* The door to the concierge desk. One live Shoreside thread per member — the
   action opens it or rejoins it, and lands the member inside either way. */
export function WriteToShoreside({ className }: { className?: string }) {
  const [state, formAction, pending] = React.useActionState<ThreadResult, FormData>(
    writeToShoreside,
    {}
  );
  return (
    <form action={formAction} className={className}>
      <Button type="submit" variant="outline" size="sm" pending={pending} pendingLabel="Writing…">
        Write to Shoreside
      </Button>
      {state.error ? (
        /* alert, not status — a refusal interrupts; see enquire.tsx. */
        <Notice tone="danger" compact className="mbr-sub--xs">
          {state.error}
        </Notice>
      ) : null}
    </form>
  );
}
