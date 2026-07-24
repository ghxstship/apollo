"use client";

import React from "react";
import { Button, Checkbox, Input, Select, StateBlock, Textarea } from "@/components/ds";
import { submitApplication } from "./actions";
import { APPLY_INITIAL, CITIES } from "./apply-shared";

export function ApplyForm() {
  const [state, action, pending] = React.useActionState(submitApplication, APPLY_INITIAL);

  if (state.ok) {
    return (
      <div className="ls-fade">
        <StateBlock
          icon="Anchor"
          title="Application received."
          detail="A person reads it — not a filter. If the water suits you, a salon invitation follows within the week."
        />
        <p className="ws-apply__meta" style={{ textAlign: "center", marginTop: 16 }}>
          {state.meta}
        </p>
      </div>
    );
  }

  return (
    // Keyed on returned values so a failed submit re-seeds the inputs.
    <form action={action} key={JSON.stringify(state.values)}>
      <Input
        label="Full name"
        name="full_name"
        placeholder="As the manifest should read it"
        defaultValue={state.values.full_name}
        error={state.errors.full_name}
        autoComplete="name"
      />
      <Input
        label="Email"
        name="email"
        type="email"
        placeholder="you@shore.com"
        defaultValue={state.values.email}
        error={state.errors.email}
        autoComplete="email"
      />
      <Select
        label="City"
        name="city"
        placeholder="The harbor nearest you"
        defaultValue={state.values.city || ""}
        error={state.errors.city}
        options={CITIES.map((c) => ({ value: c, label: c }))}
      />
      <Input
        label="Who sends you?"
        name="referral"
        placeholder="A member's name, or how you found the water"
        defaultValue={state.values.referral}
      />
      <Textarea
        label="Why the water?"
        name="note"
        rows={4}
        placeholder="A few honest lines. No résumés."
        defaultValue={state.values.note}
      />
      <Checkbox
        name="conduct"
        label="I'll sail by the code of conduct."
        description={
          state.errors.conduct ? (
            <span style={{ color: "var(--siren)" }}>{state.errors.conduct}</span>
          ) : (
            "Follow the skipper, mind the boom, leave every port better."
          )
        }
      />
      {state.errors.form ? (
        <p style={{ fontSize: 13, color: "var(--siren)" }}>{state.errors.form}</p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending" : "Send it"}
        </Button>
      </div>
    </form>
  );
}
