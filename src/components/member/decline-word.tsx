"use client";

import React from "react";
import { setBlock, type WordResult } from "@/app/(member)/directory/actions";

/* The quiet exit from a conversation you did not ask for. One button, two
   directions: decline messages from this member, or allow them again. The
   refusal itself is enforced by open_direct_thread on the server — this is
   only the switch, and the one place its own refusal can be read. */
export function DeclineWord({
  otherId,
  handle,
  firstName,
  blocked,
  className,
}: {
  otherId: string;
  handle: string | null;
  firstName: string;
  blocked: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = React.useActionState<WordResult, FormData>(
    setBlock,
    {}
  );
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="other" value={otherId} />
      {handle ? <input type="hidden" name="handle" value={handle} /> : null}
      <input type="hidden" name="intent" value={blocked ? "unblock" : "block"} />
      <button
        type="submit"
        className="ls-btn ls-btn--outline ls-btn--sm"
        disabled={pending}
      >
        {blocked ? "Allow messages again" : `Decline messages from ${firstName}`}
      </button>
      {blocked ? (
        <p className="ls-note" role="status" style={{ marginTop: 8 }}>
          {firstName} can&rsquo;t open a conversation with you. Allowing again
          undoes it — nothing else changes.
        </p>
      ) : null}
      {state.error ? (
        /* alert, not status — a refusal interrupts; see enquire.tsx. The note
           above it stays a status: it reports a state, not a failure. */
        <p className="ls-note" role="alert" style={{ marginTop: 8 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
