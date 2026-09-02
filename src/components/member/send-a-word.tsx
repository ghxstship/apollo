"use client";

import React from "react";
import { sendAWord, type WordResult } from "@/app/(member)/directory/actions";

/* The button that opens a conversation, and the one place its refusal can be
   read. The action used to redirect on every failure, so a member on hold — or
   one the other party had stopped taking messages from — pressed it and was
   bounced to the roster in silence. */
export function SendAWord({
  otherId,
  label = "Send a word",
  className,
}: {
  otherId: string;
  label?: string;
  className?: string;
}) {
  const [state, formAction, pending] = React.useActionState<WordResult, FormData>(
    sendAWord,
    {}
  );
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="other" value={otherId} />
      <button type="submit" className="ls-btn ls-btn--gold ls-btn--sm" disabled={pending}>
        {label}
      </button>
      {state.error ? (
        /* alert, not status: a refusal arrives at the worst moment and has to
           interrupt what a screen reader is saying, the way enquire.tsx already
           does. A polite region waits its turn, and a member who has moved on
           never hears it. */
        <p className="hm-note" role="alert" style={{ marginTop: 8 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
