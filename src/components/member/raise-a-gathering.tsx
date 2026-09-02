"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Input, Select, Textarea, Toast } from "@/components/ds";
import {
  raiseAProposal,
  withdrawProposal,
  type ProposalFormState,
} from "@/app/(member)/you/proposal-actions";

/* — Raise a gathering: the form, and the fate of everything raised before —

   A proposal is a case made to the Bridge, not a booking. The list below the
   form is where the member reads what became of each one: submitted sits with
   the Bridge, considering is being weighed, approved is on the calendar, and a
   declined one carries the Bridge's own line when they wrote one. Withdraw
   exists only while a proposal still reads SUBMITTED — after that the record
   is the Bridge's to rule on. */

export type ProposalCard = {
  id: string;
  title: string;
  seriesLabel: string | null;
  proposedFor: string | null;
  status: "submitted" | "considering" | "approved" | "declined";
  decisionNote: string | null;
  /* The episode the Bridge raised from this proposal, once there is one. */
  sailing: { title: string; slug: string; when: string } | null;
};

const NOTE_MAX = 2000;

const STATUS_LINE: Record<ProposalCard["status"], string> = {
  submitted: "With the Bridge",
  considering: "The Bridge is weighing it",
  approved: "On the calendar",
  declined: "The Bridge passed on this one",
};

function statusTone(s: ProposalCard["status"]): "gold" | "positive" | "caution" | "outline" {
  if (s === "approved") return "positive";
  if (s === "considering") return "caution";
  if (s === "declined") return "outline";
  return "gold";
}

/* proposed_for is a bare date — no clock, no zone. Formatting it through a
   Date would let the machine's zone move it a day; read the parts instead. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function plainDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "—"} ${String(d ?? 1).padStart(2, "0")} · ${y}`;
}

export function RaiseAGathering({
  formats,
  proposals,
}: {
  formats: Array<{ value: string; label: string }>;
  proposals: ProposalCard[];
}) {
  const [state, formAction, pending] = React.useActionState<ProposalFormState, FormData>(
    raiseAProposal,
    {}
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const [dismissedState, setDismissedState] = React.useState<ProposalFormState | null>(null);
  const showToast = !!state.raised && dismissedState !== state;
  React.useEffect(() => {
    if (!showToast) return;
    /* A fresh raise clears the form — the list below now carries the record. */
    formRef.current?.reset();
    const t = setTimeout(() => setDismissedState(state), 4000);
    return () => clearTimeout(t);
  }, [showToast, state]);

  const [withdrawPending, startWithdraw] = React.useTransition();
  const [withdrawError, setWithdrawError] = React.useState<string | null>(null);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <div className="you-grid">
          <Input
            label="The gathering"
            name="title"
            maxLength={120}
            placeholder="name it for the calendar"
            error={state.field === "title" ? state.error : undefined}
          />
          <Select
            label="Shape"
            name="series"
            options={formats}
            placeholder="Pick the shape"
          />
          <Input
            label="A date in mind"
            name="proposed_for"
            type="date"
            hint="Optional. The Bridge sets the episode date."
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <Textarea
            label="The case for it"
            name="note"
            rows={3}
            maxLength={NOTE_MAX}
            placeholder="who it's for and why it belongs on the calendar"
            hint={`Optional, up to ${NOTE_MAX} characters. The Bridge reads every one.`}
            error={state.field === "note" ? state.error : undefined}
          />
        </div>
        {/* Anything not about one control — a paused membership, a refusal
            from the table — is the form's to say, not the title's. */}
        {state.error && !state.field ? (
          <p role="alert" style={{ color: "var(--siren)", fontSize: "var(--text-xs)", marginTop: 12 }}>
            {state.error}
          </p>
        ) : null}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Raise it
          </Button>
        </div>
      </form>

      {proposals.length > 0 ? (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.map((p) => (
            <div
              key={p.id}
              className="you-row"
              style={{ alignItems: "flex-start", paddingInline: 0 }}
            >
              <div style={{ minWidth: 0 }}>
                <b>{p.title}</b>
                <p className="mbr-mono" style={{ marginTop: 4 }}>
                  {[p.seriesLabel?.toUpperCase(), p.proposedFor ? plainDate(p.proposedFor) : null]
                    .filter(Boolean)
                    .join(" · ") || "SHAPE OPEN"}
                </p>
                <p style={{ marginTop: 4 }}>
                  {p.status === "declined" && p.decisionNote
                    ? p.decisionNote
                    : STATUS_LINE[p.status]}
                </p>
                {p.sailing ? (
                  <p className="mbr-mono" style={{ marginTop: 4 }}>
                    <Link
                      href={`/episodes/${p.sailing.slug}`}
                      style={{ color: "var(--text-link)", textDecoration: "none" }}
                    >
                      {p.sailing.title.toUpperCase()} · {p.sailing.when}
                    </Link>
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <Badge tone={statusTone(p.status)}>
                  {p.status === "submitted"
                    ? "Raised"
                    : p.status === "considering"
                      ? "Weighing"
                      : p.status === "approved"
                        ? "Approved"
                        : "Declined"}
                </Badge>
                {p.status === "submitted" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={withdrawPending}
                    onClick={() => {
                      setWithdrawError(null);
                      startWithdraw(async () => {
                        const res = await withdrawProposal(p.id);
                        if (res.error) setWithdrawError(res.error);
                      });
                    }}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {withdrawError ? (
            <p role="alert" style={{ color: "var(--siren)", fontSize: "var(--text-xs)" }}>
              {withdrawError}
            </p>
          ) : null}
        </div>
      ) : null}

      {showToast ? (
        <Toast
          fixed
          message="Raised. The Bridge reads every one."
          tone="positive"
          onDismiss={() => setDismissedState(state)}
        />
      ) : null}
    </>
  );
}
