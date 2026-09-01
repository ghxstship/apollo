"use client";

import React from "react";
import { Badge, Button, Dialog, Input, StateBlock, Table, Toast } from "@/components/ds";
import { relTime, useToast } from "../../ui";
import { decideProposal } from "./actions";

/* — The proposals queue: read the case, give the word —

   Considering and Approve are one motion; Decline opens the note field first,
   because the line written there goes to the member word for word. Approval is
   the word, not the sailing — the console says so under the table. */

export type ProposalRow = {
  id: string;
  proposer: string;
  proposerMark: string | null;
  title: string;
  format: string | null;
  formatLabel: string | null;
  note: string | null;
  proposedFor: string | null;
  status: "submitted" | "considering" | "approved" | "declined";
  decisionNote: string | null;
  raisedAt: string;
  [key: string]: unknown;
};

function statusTone(s: ProposalRow["status"]): "gold" | "positive" | "caution" | "outline" {
  if (s === "approved") return "positive";
  if (s === "considering") return "caution";
  if (s === "declined") return "outline";
  return "gold";
}

const STATUS_LABEL: Record<ProposalRow["status"], string> = {
  submitted: "Raised",
  considering: "Weighing",
  approved: "Approved",
  declined: "Declined",
};

/* proposed_for is a bare date; splitting it keeps the machine's zone out. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function plainDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "—"} ${String(d ?? 1).padStart(2, "0")} · ${y}`;
}

export function ProposalsClient({ rows }: { rows: ProposalRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [declining, setDeclining] = React.useState<ProposalRow | null>(null);
  const [declineNote, setDeclineNote] = React.useState("");

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const columns = [
    {
      key: "title",
      label: "Proposal",
      render: (r: ProposalRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
            {r.proposerMark ? `${r.proposer} · ${r.proposerMark}` : r.proposer}
          </span>
          {r.note ? (
            <span style={{ display: "block", marginTop: 4, color: "var(--text-2)" }}>
              {r.note.length > 140 ? r.note.slice(0, 140) + "…" : r.note}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "format",
      label: "Shape",
      width: 120,
      render: (r: ProposalRow) => r.formatLabel ?? "Open",
    },
    {
      key: "proposedFor",
      label: "Date in mind",
      width: 130,
      mono: true,
      render: (r: ProposalRow) => (r.proposedFor ? plainDate(r.proposedFor) : "—"),
    },
    {
      key: "raisedAt",
      label: "Raised",
      width: 100,
      mono: true,
      render: (r: ProposalRow) => relTime(r.raisedAt),
    },
    {
      key: "status",
      label: "State",
      width: 100,
      render: (r: ProposalRow) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: "act",
      label: "",
      width: 250,
      render: (r: ProposalRow) =>
        r.status === "submitted" || r.status === "considering" ? (
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {r.status === "submitted" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => decideProposal(r.id, "considering"),
                    () =>
                      show({
                        msg: "Weighing it. The proposer holds the word.",
                        meta: `${r.title.toUpperCase()} · CONSIDERING`,
                      })
                  )
                }
              >
                Considering
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => decideProposal(r.id, "approved"),
                  () =>
                    show({
                      msg: "Approved, proposer told. Now raise the sailing on Voyages.",
                      meta: `${r.title.toUpperCase()} · APPROVED`,
                      tone: "positive",
                    })
                )
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDeclineNote("");
                setDeclining(r);
              }}
            >
              Decline
            </Button>
          </span>
        ) : r.status === "declined" && r.decisionNote ? (
          <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{r.decisionNote}</span>
        ) : null,
    },
  ];

  return (
    <>
      {rows.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <StateBlock
            title="Nothing raised."
            detail="Members raise gatherings and mixers from their own page. What they raise queues here, newest first."
          />
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
        </div>
      )}

      <p style={{ marginTop: 14, color: "var(--text-3)", fontSize: 12.5 }}>
        Approval is the word, not the sailing. The sailing itself gets raised on
        Voyages, with access set by the format.
      </p>

      <Dialog
        open={!!declining}
        onClose={() => setDeclining(null)}
        width={420}
        eyebrow={declining ? declining.proposer : ""}
        title="Pass on this one?"
        footer={
          declining ? (
            <>
              <Button variant="ghost" onClick={() => setDeclining(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={pending}
                onClick={() => {
                  const r = declining;
                  const line = declineNote;
                  setDeclining(null);
                  run(
                    () => decideProposal(r.id, "declined", line),
                    () =>
                      show({
                        msg: "Declined, with the word to the proposer.",
                        meta: `${r.title.toUpperCase()} · DECLINED`,
                        tone: "caution",
                      })
                  );
                }}
              >
                Decline + tell them
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: 13 }}>
            The line below reaches the member word for word. Left blank, they
            read &quot;The Bridge passed on this one&quot;.
          </p>
          <Input
            label="The word to the member"
            placeholder="Why it isn't sailing, said the way you'd say it to them."
            value={declineNote}
            onChange={(e) => setDeclineNote(e.target.value)}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
