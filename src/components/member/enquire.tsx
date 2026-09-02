"use client";

import React from "react";
import { Button, Input, Textarea, Toast } from "@/components/ds";
import {
  raiseCharterRequest,
  type CharterRequestState,
} from "@/app/(member)/charter/request-actions";

/* — Enquire: the door for an on-request format.

   No pass, no price, no Reserve — the format is answered by the Bridge, and
   this form is how a member asks. It sits where the Reserve button would on
   the charter page, carries the sailing it was raised from, and says once
   when the enquiry has landed. Errors about one field sit on that field;
   anything else is the form's to say. — */

const DATES_MAX = 200;
const NOTE_MAX = 2000;

export function Enquire({
  sailingTitle,
  formatSlug,
  formatLabel,
}: {
  sailingTitle: string;
  formatSlug: string | null;
  formatLabel: string | null;
}) {
  const [state, formAction, pending] = React.useActionState<CharterRequestState, FormData>(
    raiseCharterRequest,
    {}
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const [dismissedState, setDismissedState] = React.useState<CharterRequestState | null>(null);
  const showToast = !!state.raised && dismissedState !== state;
  React.useEffect(() => {
    if (!showToast) return;
    formRef.current?.reset();
    const t = setTimeout(() => setDismissedState(state), 4000);
    return () => clearTimeout(t);
  }, [showToast, state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="sailing" value={sailingTitle} />
        {formatSlug ? <input type="hidden" name="format" value={formatSlug} /> : null}
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginBottom: 12 }}>
          {formatLabel ?? "This one"} is on request. Say who and when; the Bridge
          answers by word.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <Input
            label="How many of you"
            name="party_size"
            type="number"
            inputMode="numeric"
            min={1}
            max={96}
            error={state.field === "party" ? state.error : undefined}
          />
          <Input
            label="Dates that suit"
            name="preferred_dates"
            maxLength={DATES_MAX}
            placeholder="a weekend, a month, a window"
            error={state.field === "dates" ? state.error : undefined}
          />
          <Textarea
            label="Anything the Bridge should know"
            name="note"
            rows={3}
            maxLength={NOTE_MAX}
            hint="Optional. The occasion, the water you have in mind."
            error={state.field === "note" ? state.error : undefined}
          />
        </div>
        {state.error && !state.field ? (
          <p role="alert" style={{ color: "var(--siren)", fontSize: "var(--text-xs)", marginTop: 12 }}>
            {state.error}
          </p>
        ) : null}
        <div style={{ marginTop: 14 }}>
          <Button type="submit" variant="gold" size="sm" fullWidth disabled={pending}>
            {pending ? "Sending…" : "Enquire"}
          </Button>
        </div>
      </form>
      {showToast ? (
        <Toast
          fixed
          tone="positive"
          message="Enquiry raised. The Bridge answers by word."
          onDismiss={() => setDismissedState(state)}
        />
      ) : null}
    </>
  );
}
