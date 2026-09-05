"use client";

/* Phone capture — the number a weather hold can reach.
   Writes profiles.phone; the SMS outbox and the send-sms function do the rest.
   Saving a new number clears verification, so the queue re-earns it. */

import React from "react";
import { Button, Input } from "@/components/ds";
import { savePhone, type PhoneState } from "./signal-actions";
import "./phone-field.css";

const INITIAL: PhoneState = {};

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
    <form action={action} className="phone" aria-busy={pending || undefined}>
      <div className="phone__row">
        <Input
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 310 555 0148"
          defaultValue={current}
          error={state.error}
        />
        {/* md, the same height as the input it saves — it was sm beside a
            44px field. */}
        <Button type="submit" variant="outline" size="md" className="phone__save" pending={pending} pendingLabel="Saving">
          Save
        </Button>
      </div>
      {/* An uppercase mono label, so it takes the label pair (--type-label,
          --tracking-label) like every other label in the kit. */}
      <span className="phone__mono">Weather holds reach this number.</span>
      {/* The line that changes after Save is the only feedback a screen reader
          gets — a live region, so SAVED is heard and not just painted. */}
      <span className="phone__mono" role="status" aria-live="polite">
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
