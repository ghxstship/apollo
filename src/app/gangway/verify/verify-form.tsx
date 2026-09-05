"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Button, Input } from "@/components/ds";
import { verifyTwoStep, type VerifyState } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending || undefined}>
      {pending ? "Checking" : "Continue"}
    </Button>
  );
}

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = React.useActionState<VerifyState, FormData>(verifyTwoStep, {});
  const [code, setCode] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  /* The kit's Input takes no ref; the field is read off the form by name. */
  const field = () => formRef.current?.elements.namedItem("code") as HTMLInputElement | null;
  /* Which six digits already went — so a re-render never sends them twice,
     and a wrong code is not re-sent until it is edited. */
  const fired = React.useRef<string | null>(null);

  /* Six digits is the whole answer, so the sixth submits. Read after commit
     rather than in onChange: requestSubmit() serialises the DOM, and the DOM
     is only up to date once React has painted the controlled value. */
  React.useEffect(() => {
    if (code.length === 6 && fired.current !== code) {
      fired.current = code;
      formRef.current?.requestSubmit();
    }
  }, [code]);

  /* A code that did not match stays on screen, selected, so the next six
     digits typed replace it. */
  React.useEffect(() => {
    if (state.error) field()?.select();
  }, [state.error]);

  return (
    <div>
      <h1 className="gw-h">Your code.</h1>
      <p className="gw-sub">Two-step is on for this account. Open your code app and type the six digits.</p>
      <form action={action} className="gw-stack" ref={formRef}>
        <input type="hidden" name="next" value={next} />
        <Input
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
