"use client";

import React from "react";
import { Button, Checkbox, Input, Select, StateBlock, Textarea } from "@/components/ds";
import { submitApplication } from "./actions";
import {
  ANSWER_MAX,
  APPLY_INITIAL,
  CITIES,
  PROPOSER_MAX,
  answerField,
  questionOptions,
  type ApplyQuestion,
} from "./apply-shared";

export function ApplyForm({ questions = [] }: { questions?: ApplyQuestion[] }) {
  const [state, action, pending] = React.useActionState(submitApplication, APPLY_INITIAL);

  if (state.ok) {
    return (
      <div className="ls-fade">
        <StateBlock
          icon="Anchor"
          title="Application received."
          detail="A person reads it — not a filter. If the water suits you, an invitation ashore follows within the week."
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
        placeholder="The city nearest you"
        defaultValue={state.values.city || ""}
        error={state.errors.city}
        options={CITIES.map((c) => ({ value: c, label: c }))}
      />
      <Input
        label="Who sends you?"
        name="referral"
        // Same exclusion as the label below: "how you found the water" asks
        // about boats on a form most of whose episodes are ashore.
        placeholder="A member's name, or how you found us"
        defaultValue={state.values.referral}
      />
      {/* The proposer is a member who puts their name to the application —
          distinct from a referral, which may be a podcast. Shoreside reads
          the two apart, so the form asks them apart. */}
      <Input
        label="Who proposed you, if anyone?"
        name="proposer"
        placeholder="A member's name — leave it blank if no one yet"
        defaultValue={state.values.proposer}
        error={state.errors.proposer}
        maxLength={PROPOSER_MAX}
        autoComplete="off"
      />
      <Input
        label="Invite code"
        name="invite"
        placeholder="UN-XXXX-XXXX"
        defaultValue={state.values.invite}
        error={state.errors.invite}
        hint="If a member handed you one. Optional."
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        // .ls-input draws its face from var(--font-sans); re-pointing the
        // variable on the field wrapper is the only inline route to a mono
        // code box, since Input keeps `style` on the wrapper, not the input.
        style={{ "--font-sans": "var(--font-mono)" } as React.CSSProperties}
      />
      {/* Was "Why the water?", which asks an applicant to explain an interest
          in boats — and thirty-four of the season's fifty-two episodes never
          leave land. Aboard is the club's word for joining, afloat or not. */}
      <Textarea
        label="Why come aboard?"
        name="note"
        rows={4}
        placeholder="A few honest lines. No résumés."
        defaultValue={state.values.note}
      />
      {/* The Bridge's own questions, in position order. A required one is
          marked in the label and refused by the action if left blank; the
          browser's `required` is the first word, not the last. */}
      {questions.map((q) => {
        const name = answerField(q.key);
        const label = q.required ? q.prompt : `${q.prompt} (optional)`;
        const common = {
          name,
          label,
          required: q.required,
          error: state.errors[name],
        };
        if (q.kind === "choice") {
          return (
            <Select
              key={q.key}
              {...common}
              placeholder="Choose one"
              defaultValue={state.values.answers[q.key] ?? ""}
              options={questionOptions(q.options)}
            />
          );
        }
        if (q.kind === "long") {
          return (
            <Textarea
              key={q.key}
              {...common}
              rows={4}
              maxLength={ANSWER_MAX}
              placeholder="A few honest lines."
              defaultValue={state.values.answers[q.key] ?? ""}
            />
          );
        }
        return (
          <Input
            key={q.key}
            {...common}
            maxLength={ANSWER_MAX}
            defaultValue={state.values.answers[q.key] ?? ""}
          />
        );
      })}
      <Checkbox
        name="conduct"
        label="I'll sail by the code of conduct."
        error={state.errors.conduct}
        description="Follow the skipper, mind the boom, leave every port better."
      />
      {state.errors.form ? (
        <p role="alert" style={{ fontSize: "var(--text-sm)", color: "var(--siren)" }}>
          {state.errors.form}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending" : "Send it"}
        </Button>
      </div>
    </form>
  );
}
