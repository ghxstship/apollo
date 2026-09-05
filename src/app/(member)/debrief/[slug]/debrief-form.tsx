"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Radio, Textarea } from "@/components/ds";
import { sendDebrief, type DebriefResult } from "../actions";

/* The form is the question and one Send. No stars, no scale — a textarea and
   a yes/no, which is the whole of what the Bridge asked for. */
export function DebriefForm({ episodeId, slug }: { episodeId: string; slug: string }) {
  const router = useRouter();
  const [state, formAction, pending] = React.useActionState<DebriefResult, FormData>(
    sendDebrief,
    {}
  );

  /* Once sent, the page re-reads the row and shows what was written. An
     effect is the honest place for a navigation side-effect keyed on an
     action's result; nothing is set into state here. */
  React.useEffect(() => {
    if (state.sent) router.refresh();
  }, [state.sent, router]);

  if (state.sent) {
    return (
      <p className="dbf-sent" role="status">
        Sent to Shoreside. Nowhere else.
      </p>
    );
  }

  return (
    <form action={formAction} className="dbf-form">
      <input type="hidden" name="episode" value={episodeId} />
      <input type="hidden" name="slug" value={slug} />
      <Textarea
        name="note"
        label="Anything the Bridge should know?"
        rows={5}
        maxLength={2000}
        placeholder="The music, the water, a name that made the night. Or what did not work."
        hint="Up to 2000 characters. Read by the Bridge; never posted anywhere."
      />
      <fieldset className="dbf-fieldset">
        <legend className="dbf-q">Would you sail with this crew again?</legend>
        <div className="ls-choices dbf-again">
          <Radio name="again" value="yes" label="Yes" />
          <Radio name="again" value="no" label="No" />
        </div>
      </fieldset>
      <div className="dbf-acts">
        <Button type="submit" variant="gold" disabled={pending}>
          Send
        </Button>
        <span className="dbf-note">One answer a night. It cannot be edited after.</span>
      </div>
      {state.error ? (
        <p className="dbf-err" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
