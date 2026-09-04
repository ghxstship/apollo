"use client";

import React from "react";
import { Button } from "@/components/ds";
import { enterContest, withdrawFromContest, type ContestResult } from "../actions";

/* Enter, Withdraw, and the one place their refusal can be read. The page keeps
   this control off the screen when the database would refuse the entry, so what
   surfaces here is the unforeseen refusal — a contest closed a second ago, a
   membership paused in another tab — which is exactly the kind a member cannot
   guess at. */
export function ContestEntry({
  contestId,
  slug,
  entered,
}: {
  contestId: string;
  slug: string;
  entered: boolean;
}) {
  const [state, formAction, pending] = React.useActionState<ContestResult, FormData>(
    entered ? withdrawFromContest : enterContest,
    {}
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="contest" value={contestId} />
      <input type="hidden" name="slug" value={slug} />
      <Button type="submit" variant={entered ? "ghost" : "gold"} disabled={pending}>
        {entered ? "Withdraw" : "Enter"}
      </Button>
      {state.error ? (
        <p role="alert" style={{ marginTop: 8, fontSize: "var(--text-sm)", color: "var(--siren)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
