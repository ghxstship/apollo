"use client";

import React from "react";
import { Button, Input } from "@/components/ds";
import { lookupApplication } from "./actions";
import { NEXT_STEP, REACHED, STAGES, STAGE_LINE, STATUS_INITIAL } from "./shared";

/* The ladder reads site.css's .as-ladder rules, which were written for it and
   then never wired in: the list kept fifteen inline style objects and the one
   state that matters — the stage the applicant is AT — looked exactly like the
   ones after it. Three states now: done, now, ahead. `reached` counts stages
   climbed, so the last climbed one is where they stand. */
function Ladder({ reached }: { reached: number }) {
  return (
    <ol className="as-ladder">
      {STAGES.map((stage, i) => {
        const state = i < reached - 1 ? "done" : i === reached - 1 ? "now" : "ahead";
        return (
          <li key={stage.title} data-state={state}>
            <span aria-hidden="true" className="as-ladder__dot"></span>
            <div>
              <b className="as-ladder__t">{stage.title}</b>
              <p className="as-ladder__note">{stage.note}</p>
              <span className="as-ladder__state">
                {state === "done" ? "Reached" : state === "now" ? "You are here" : "Ahead"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StatusLookup() {
  const [state, action, pending] = React.useActionState(lookupApplication, STATUS_INITIAL);

  return (
    <div className="as-lookup">
      <form action={action} className="as-lookup__form" aria-busy={pending || undefined}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="The address you applied with"
          defaultValue={state.email ?? ""}
          error={state.state === "error" ? state.error : undefined}
          className="as-lookup__field"
        />
        {/* Pinned to the field's top, so an error opening under the field
            does not drag the button down with it. */}
        <div className="as-lookup__go">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Looking…" : "Look it up"}
          </Button>
        </div>
      </form>

      {/* The looked-up answer is the entire purpose of this page, and it was
          injected silently — announced to nobody (WCAG 4.1.3). */}
      <div aria-live="polite">
      {state.state === "unknown" ? (
        <div className="as-answer">
          <p>No application under that address.</p>
        </div>
      ) : null}

      {state.state === "found" && state.status === "declined" ? (
        <div className="as-answer">
          <p>
            Not this season. It is a question of fit and of room, never of worth — and the
            water keeps. You are welcome to apply again next season, and a member&rsquo;s
            signature carries weight when you do.
          </p>
          <span className="as-answer__closed">CLOSED · APPLY AGAIN NEXT SEASON</span>
        </div>
      ) : null}

      {state.state === "found" && state.status && state.status !== "declined" ? (
        <div className="as-answer">
          <p>{STAGE_LINE[state.status]}</p>
          <p className="as-answer__next">
            <b>Next:</b> {NEXT_STEP[state.status]}
          </p>
          <Ladder reached={REACHED[state.status]} />
        </div>
      ) : null}
      </div>
    </div>
  );
}
