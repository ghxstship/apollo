"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Input } from "@/components/ds";
import { setPassword, type PasswordState } from "../actions";
import { PASSWORD_MIN } from "../ways";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? "Saving" : "Save the password"}
    </Button>
  );
}

export function ResetForm({ next }: { next: string }) {
  const [state, action] = React.useActionState<PasswordState, FormData>(setPassword, {});
  return (
    <div>
      <h1 className="gw-h">Choose a password.</h1>
      <p className="gw-sub">At least {PASSWORD_MIN} characters. The magic link keeps working beside it.</p>
      {state.done ? (
        <div className="gw-sent" aria-live="polite">
          <Badge tone="positive">Saved</Badge>
          <p>Your password is set. You are signed in.</p>
          <div className="gw-mono" style={{ marginTop: 12 }}>
            <a href={next}>CARRY ON →</a>
          </div>
        </div>
      ) : (
        <form action={action} className="gw-stack">
          <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          <Input label="Once more" name="again" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required error={state.error} />
          <Submit />
        </form>
      )}
    </div>
  );
}
