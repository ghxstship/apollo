"use client";

import React from "react";
import { Button, Input } from "@/components/ds";
import { lookupApplication } from "./actions";
import { REACHED, STAGES, STAGE_LINE, STATUS_INITIAL } from "./shared";

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "var(--track-data)",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

function Ladder({ reached }: { reached: number }) {
  return (
    <ol
      style={{ listStyle: "none", margin: "28px 0 0", padding: 0, borderTop: "1px solid var(--line-faint)" }}
    >
      {STAGES.map((stage, i) => {
        const done = i < reached;
        return (
          <li
            key={stage.title}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              gap: 14,
              padding: "16px 0",
              borderBottom: "1px solid var(--line-faint)",
              opacity: done ? 1 : 0.55,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                marginTop: 5,
                borderRadius: 999,
                border: "1px solid var(--line-strong)",
                background: done ? "var(--brass-deep)" : "transparent",
              }}
            ></span>
            <div>
              <b style={{ fontSize: 14, fontWeight: 600 }}>{stage.title}</b>
              <p style={{ ...MONO, marginTop: 5, textTransform: "none", fontSize: 11 }}>
                {stage.note}
              </p>
              <span style={{ ...MONO, display: "block", marginTop: 6 }}>
                {done ? "REACHED" : "AHEAD"}
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
          <Ladder reached={REACHED[state.status]} />
        </div>
      ) : null}
    </div>
  );
}
