"use client";

import React from "react";
import { sendAWord, type WordResult } from "@/app/(member)/directory/actions";
import { Button, Notice } from "@/components/ds";

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
      <Button type="submit" variant="gold" size="sm" pending={pending} pendingLabel="Sending…">
        {label}
      </Button>
      {state.error ? (
        /* alert, not status: a refusal arrives at the worst moment and has to
           interrupt what a screen reader is saying, the way enquire.tsx already
           does. A polite region waits its turn, and a member who has moved on
           never hears it. */
        <Notice tone="danger" compact className="mbr-sub--xs">
          {state.error}
        </Notice>
      ) : null}
    </form>
  );
}
