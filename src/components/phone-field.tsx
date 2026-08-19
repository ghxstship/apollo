"use client";

/* Phone capture — the number a weather hold can reach.
   Writes profiles.phone; the SMS outbox and the send-sms function do the rest.
   Saving a new number clears verification, so the queue re-earns it. */

import React from "react";
import { Button, Input } from "@/components/ds";
import { savePhone, type PhoneState } from "./signal-actions";

const INITIAL: PhoneState = {};

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "var(--track-data)",
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
      <span style={MONO}>
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
