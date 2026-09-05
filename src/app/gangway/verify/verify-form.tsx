"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ds";
import { verifyTwoStep, type VerifyState } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? "Checking" : "Continue"}
    </Button>
  );
}

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = React.useActionState<VerifyState, FormData>(verifyTwoStep, {});
  return (
    <div>
      <h1 className="gw-h">Your code.</h1>
      <p className="gw-sub">Two-step is on for this account. Open your code app and type the six digits.</p>
      <form action={action} className="gw-stack">
        <input type="hidden" name="next" value={next} />
        <Input
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          placeholder="000 000"
          required
          autoFocus
          error={state.error}
          className="gw-code"
        />
        <Submit />
      </form>
      <div className="gw-alt">
        Lost the code app? <a href="/support">Hail Shoreside</a> — a person can switch two-step off for you.
      </div>
    </div>
  );
}
