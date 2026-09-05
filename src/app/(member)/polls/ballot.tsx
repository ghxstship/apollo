"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds";
import { castVote } from "./actions";

/* The options as buttons. Your vote is the filled one; pressing another moves
   it, until the question closes. The refusal, when there is one, reads here. */
export function Ballot({
  pollId,
  options,
  mine,
}: {
  pollId: string;
  options: string[];
  mine: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  /* The filled button moves as the finger lifts; the server's answer settles
     it a round trip later, and a refusal puts it back with the reason. */
  const [shown, setShown] = React.useOptimistic(mine);

  const vote = (option: number) => {
    setError(null);
    startTransition(async () => {
      setShown(option);
      const res = await castVote(pollId, option);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <div className="pol-opts" role="group" aria-label="Options">
        {options.map((label, i) => (
          <Button
            key={i}
            type="button"
            size="sm"
            variant={shown === i ? "gold" : "outline"}
            aria-pressed={shown === i}
            disabled={pending}
            onClick={() => vote(i)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="pol-mine">
        {shown === null
          ? "No vote from you yet."
          : `Your vote: ${options[shown] ?? "—"}. Change it any time before it closes.`}
      </p>
      {error ? (
        <p className="pol-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
