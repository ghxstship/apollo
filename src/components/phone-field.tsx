"use client";

/* Phone capture — the number a weather hold can reach.
   Writes profiles.phone; the SMS outbox and the send-sms function do the rest.
   Saving a new number clears verification, so the queue re-earns it. */

import React from "react";
import { Button, Input } from "@/components/ds";
import { savePhone, type PhoneState } from "./signal-actions";

const INITIAL: PhoneState = {};

/* An uppercase mono label, so it takes the label pair (--type-label,
   --tracking-label) like every other label in the kit. It was 10px on
   --track-data, which is the .04em FIGURES setting — see compat.css. */
const MONO: React.CSSProperties = {
  font: "var(--type-label)",
  letterSpacing: "var(--tracking-label)",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

export function PhoneField({
  defaultValue = "",
  verified = false,
}: {
  defaultValue?: string | null;
  verified?: boolean;
}) {
  const [state, action, pending] = React.useActionState(savePhone, INITIAL);
  const current = state.value ?? defaultValue ?? "";

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Input
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 310 555 0148"
          defaultValue={current}
          error={state.error}
          style={{ flex: "1 1 220px", marginBottom: 0 }}
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
      </div>
      <span style={MONO}>Weather holds reach this number.</span>
      {/* The line that changes after Save is the only feedback a screen reader
          gets — a live region, so SAVED is heard and not just painted. */}
      <span style={MONO} role="status" aria-live="polite">
        {state.cleared
          ? "NUMBER REMOVED"
          : state.saved
            ? "SAVED · AWAITING CONFIRMATION"
            : current
              ? verified
                ? "CONFIRMED"
                : "AWAITING CONFIRMATION"
              : "NO NUMBER ON FILE"}
      </span>
    </form>
  );
}
