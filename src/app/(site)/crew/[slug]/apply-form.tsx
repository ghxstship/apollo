"use client";

import React from "react";
import { Button, Input, StateBlock, Textarea } from "@/components/ds";
import { submitCrewApplication, type CrewApplyState } from "./actions";

const EMPTY: CrewApplyState = {
  ok: false,
  errors: {},
  values: { full_name: "", email: "", phone: "", links: "", source: "", note: "" },
};

/* The form that replaced a mailto:.

   A mailto: asks a candidate to compose an email from nothing, gives the club
   no structure to sort by, and leaves the pipeline in the Bridge with no way to
   fill itself. Six fields, three of them optional, and the one that matters is
   the last.

   No CV upload, and that is a decision rather than an omission: an anonymous
   file-upload endpoint is a materially different risk from an anonymous row
   insert — no size limit a policy can express, nothing to scan the contents,
   and no person attached to the bytes. A link answers the same question and
   opens nothing. */
export function CrewApplyForm({ roleId, roleTitle }: { roleId: string; roleTitle: string }) {
  const [state, formAction, pending] = React.useActionState(submitCrewApplication, EMPTY);

  if (state.ok) {
    return (
      <StateBlock
        status="empty"
        icon="Check"
        title="That's in."
        detail={`Your application for ${roleTitle} is with us. A person reads it — expect a reply either way, and if it takes longer than a week, chase us.`}
      />
    );
  }

  return (
    <form action={formAction} className="crew-form">
      <input type="hidden" name="role_id" value={roleId} />
      <span className="ls-eyebrow crew-form__eyebrow">Apply — {roleTitle}</span>

      <Input
        name="full_name"
        label="Your name"
        defaultValue={state.values.full_name}
        error={state.errors.full_name}
        required
      />
      <Input
        name="email"
        type="email"
        label="Email"
        defaultValue={state.values.email}
        error={state.errors.email}
        required
      />
      <Input
        name="phone"
        label="Phone — optional"
        defaultValue={state.values.phone}
        error={state.errors.phone}
      />
      <Input
        name="links"
        label="A link — optional"
        placeholder="Portfolio, profile, anything that shows the work"
        defaultValue={state.values.links}
        error={state.errors.links}
      />
      <Input
        name="source"
        label="How did you find this? — optional"
        defaultValue={state.values.source}
        error={state.errors.source}
      />
      <Textarea
        name="note"
        label="Why you"
        rows={7}
        maxLength={4000}
        placeholder="What you have done that is like this, and what you would want to change in the first month."
        defaultValue={state.values.note}
        error={state.errors.note}
        required
      />

      {state.errors.form ? (
        <p role="alert" className="crew-form__err">
          {state.errors.form}
        </p>
      ) : null}

      <Button type="submit" variant="gold" fullWidth disabled={pending}>
        {pending ? "Sending…" : "Send it"}
      </Button>
      <p className="crew-form__fine">
        We keep what you send here to consider you for this role, and we reply
        either way.
      </p>
    </form>
  );
}
