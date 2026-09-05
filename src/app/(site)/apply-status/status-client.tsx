"use client";

import React from "react";
import { Button, Input } from "@/components/ds";
import { lookupApplication } from "./actions";
import { NEXT_STEP, REACHED, STAGES, STAGE_LINE, STATUS_INITIAL } from "./shared";

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "var(--track-data)",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

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
    <div style={{ marginTop: 32 }}>
      <form action={action} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="The address you applied with"
          defaultValue={state.email ?? ""}
          error={state.state === "error" ? state.error : undefined}
          style={{ flex: "1 1 260px", marginBottom: 0 }}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Looking" : "Look it up"}
        </Button>
      </form>

      {/* The looked-up answer is the entire purpose of this page, and it was
          injected silently — announced to nobody (WCAG 4.1.3). */}
      <div aria-live="polite">
      {state.state === "unknown" ? (
        <p style={{ marginTop: 24, fontSize: 14, color: "var(--text-2)" }}>
          No application under that address.
        </p>
      ) : null}

      {state.state === "found" && state.status === "declined" ? (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: "48ch" }}>
            Not this season. It is a question of fit and of room, never of worth — and the
            water keeps. You are welcome to apply again next season, and a member&rsquo;s
            signature carries weight when you do.
          </p>
          <span style={{ ...MONO, display: "block", marginTop: 14 }}>CLOSED · APPLY AGAIN NEXT SEASON</span>
        </div>
      ) : null}

      {state.state === "found" && state.status && state.status !== "declined" ? (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 14, color: "var(--text-2)", maxWidth: "48ch" }}>
            {STAGE_LINE[state.status]}
          </p>
          <p style={{ fontSize: 14, color: "var(--text-1)", maxWidth: "48ch", marginTop: 8 }}>
            <b>Next:</b> {NEXT_STEP[state.status]}
          </p>
          <Ladder reached={REACHED[state.status]} />
        </div>
      ) : null}
      </div>
    </div>
  );
}
