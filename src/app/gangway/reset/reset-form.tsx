"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Notice } from "@/components/ds";
import { setPassword, type PasswordState } from "../actions";
import { PasswordInput } from "../password-input";
import { PASSWORD_MIN } from "../ways";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth pending={pending} pendingLabel="Saving">
      Save the password
    </Button>
  );
}

export function ResetForm({ next }: { next: string }) {
  const [state, action] = React.useActionState<PasswordState, FormData>(setPassword, {});
  /* One switch for both fields — see PasswordInput. */
  const [shown, setShown] = React.useState(false);
  const toggle = () => setShown((s) => !s);
  const doneRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (state.done) doneRef.current?.focus({ preventScroll: true });
  }, [state.done]);
  return (
    <div>
      <h1 className="gw-h">Choose a password.</h1>
      <p className="gw-sub">At least {PASSWORD_MIN} characters. The magic link keeps working beside it.</p>
      {state.done ? (
        <div className="gw-sent ls-rise" ref={doneRef} tabIndex={-1}>
          <Notice tone="positive">
            <Badge tone="positive">Saved</Badge>
            <p>Your password is set. You are signed in.</p>
            <div className="gw-mono gw-sent__meta">
              <a href={next}>CARRY ON →</a>
            </div>
          </Notice>
        </div>
      ) : (
        <form action={action} className="gw-stack">
          <PasswordInput
            label="New password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            shown={shown}
            onToggle={toggle}
          />
          <PasswordInput
            label="Once more"
            name="again"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            error={state.error}
            shown={shown}
            onToggle={toggle}
          />
          <Submit />
        </form>
      )}
    </div>
  );
}
