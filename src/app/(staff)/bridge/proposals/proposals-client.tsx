"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
import { relTime, useToast } from "../../ui";
import { decideCharter, decideProposal, linkProposal, type CharterRuling } from "./actions";

/* — The proposals queue: read the case, give the word —

   Considering is one motion; Approve opens a small dialog so the ruling can
   name the sailing it became (optional — approval is the word, the sailing may
   not exist yet); Decline opens the note field first, because the line written
   there goes to the member word for word. */

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
  /* The sailing this became, once the Bridge raised it and linked it. */
  voyageId: string | null;
  voyageLabel: string | null;
  [key: string]: unknown;
};

export type CharterRow = {
  id: string;
  proposer: string;
  proposerMark: string | null;
  formatLabel: string | null;
  partySize: number | null;
  preferredDates: string | null;
  note: string | null;
  status: "submitted" | "answered" | "declined";
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

const CHARTER_LABEL: Record<CharterRow["status"], string> = {
  submitted: "Raised",
  answered: "Answered",
  declined: "Declined",
};

function charterTone(s: CharterRow["status"]): "gold" | "positive" | "outline" {
  if (s === "answered") return "positive";
  if (s === "declined") return "outline";
  return "gold";
}

/* proposed_for is a bare date; splitting it keeps the machine's zone out. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function plainDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "—"} ${String(d ?? 1).padStart(2, "0")} · ${y}`;
}

export function ProposalsClient({
  rows,
  charters,
  voyages,
}: {
  rows: ProposalRow[];
  charters: CharterRow[];
  voyages: Array<{ value: string; label: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [declining, setDeclining] = React.useState<ProposalRow | null>(null);
  const [declineNote, setDeclineNote] = React.useState("");
  const [approving, setApproving] = React.useState<ProposalRow | null>(null);
  const [approveVoyage, setApproveVoyage] = React.useState("");
  /* Per-row re-link picks for approved proposals not yet tied to a sailing. */
  const [links, setLinks] = React.useState<Record<string, string>>({});

  const [ruling, setRuling] = React.useState<{ row: CharterRow; kind: CharterRuling } | null>(null);
  const [charterNote, setCharterNote] = React.useState("");

  const run = (fn: () => Promise<{ error?: string; note?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else if (res.note) show({ msg: res.note, tone: "caution" });
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
          {r.voyageLabel ? (
            <span style={{ display: "block", marginTop: 4, color: "var(--text-2)" }}>
              Sailing: {r.voyageLabel}
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
      width: 260,
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
              onClick={() => {
                setApproveVoyage("");
                setApproving(r);
              }}
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
        ) : r.status === "approved" && !r.voyageId ? (
          <span style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Select
              aria-label={`Sailing for ${r.title}`}
              value={links[r.id] ?? ""}
              onChange={(e) => setLinks((p) => ({ ...p, [r.id]: e.target.value }))}
              style={{ minWidth: 180 }}
              options={[
                { value: "", label: voyages.length ? "Link the sailing" : "Nothing on the board" },
                ...voyages,
              ]}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || !links[r.id]}
              onClick={() =>
                run(
                  () => linkProposal(r.id, links[r.id] ?? null),
                  () => show({ msg: "Linked. The row names the sailing now.", meta: r.title.toUpperCase() })
                )
              }
            >
              Link
            </Button>
          </span>
        ) : r.status === "declined" && r.decisionNote ? (
          <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{r.decisionNote}</span>
        ) : null,
    },
  ];

  const charterColumns = [
    {
      key: "proposer",
      label: "Member",
      render: (r: CharterRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.proposer}</b>
          {r.proposerMark ? (
            <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.proposerMark}</span>
          ) : null}
          {r.note ? (
            <span style={{ display: "block", marginTop: 4, color: "var(--text-2)" }}>
              {r.note.length > 160 ? r.note.slice(0, 160) + "…" : r.note}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "format",
      label: "Shape",
      width: 130,
      render: (r: CharterRow) => r.formatLabel ?? "Open",
    },
    {
      key: "party",
      label: "Party",
      width: 70,
      mono: true,
      render: (r: CharterRow) => (r.partySize != null ? String(r.partySize) : "—"),
    },
    {
      key: "dates",
      label: "Dates in mind",
      width: 170,
      render: (r: CharterRow) => r.preferredDates ?? "—",
    },
    {
      key: "raisedAt",
      label: "Raised",
      width: 100,
      mono: true,
      render: (r: CharterRow) => relTime(r.raisedAt),
    },
    {
      key: "status",
      label: "State",
      width: 100,
      render: (r: CharterRow) => <Badge tone={charterTone(r.status)}>{CHARTER_LABEL[r.status]}</Badge>,
    },
    {
      key: "act",
      label: "",
      width: 170,
      render: (r: CharterRow) =>
        r.status === "submitted" ? (
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setCharterNote("");
                setRuling({ row: r, kind: "answered" });
              }}
            >
              Answer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setCharterNote("");
                setRuling({ row: r, kind: "declined" });
              }}
            >
              Decline
            </Button>
          </span>
        ) : r.decisionNote ? (
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
        Voyages, with access set by the format — link it here once it exists, so
        the row and the member both know which sailing it became.
      </p>

      <section className="hm-sec">
        <h2>Charter requests.</h2>
        <p className="hm-lede" style={{ marginTop: 4 }}>
          An on-request format has a door. A member asks for a shape, a party
          and some dates; the Bridge answers with a line, or passes with one.
          Either way the line reaches them as a word.
        </p>
        {charters.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <StateBlock
              title="No charter requests."
              detail="Formats marked on-request take a request from the member side. They queue here."
            />
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <Table columns={charterColumns} rows={charters} rowKey={(r) => r.id} />
          </div>
        )}
      </section>

      <Dialog
        open={!!approving}
        onClose={() => setApproving(null)}
        width={440}
        eyebrow={approving ? approving.proposer : ""}
        title="Approve it?"
        footer={
          approving ? (
            <>
              <Button variant="ghost" onClick={() => setApproving(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={pending}
                onClick={() => {
                  const r = approving;
                  const v = approveVoyage || null;
                  setApproving(null);
                  run(
                    () => decideProposal(r.id, "approved", undefined, v),
                    () =>
                      show({
                        msg: v
                          ? "Approved, proposer told, sailing linked."
                          : "Approved, proposer told. Now raise the sailing on Voyages.",
                        meta: `${r.title.toUpperCase()} · APPROVED`,
                        tone: "positive",
                      })
                  );
                }}
              >
                {approveVoyage ? "Approve + link" : "Approve"}
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: 13 }}>
            The proposer is told either way. If the sailing already exists on the
            board, name it here and the row will carry it.
          </p>
          <Select
            label="The sailing it became"
            hint="Optional — leave it if the sailing is not raised yet."
            value={approveVoyage}
            onChange={(e) => setApproveVoyage(e.target.value)}
            options={[
              { value: "", label: voyages.length ? "Not yet raised" : "Nothing on the board" },
              ...voyages,
            ]}
          />
        </div>
      </Dialog>

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

      <Dialog
        open={!!ruling}
        onClose={() => setRuling(null)}
        width={440}
        eyebrow={ruling ? ruling.row.proposer : ""}
        title={ruling?.kind === "answered" ? "Answer the request" : "Pass on this request?"}
        footer={
          ruling ? (
            <>
              <Button variant="ghost" onClick={() => setRuling(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={pending || (ruling.kind === "answered" && !charterNote.trim())}
                onClick={() => {
                  const { row, kind } = ruling;
                  const line = charterNote;
                  setRuling(null);
                  run(
                    () => decideCharter(row.id, kind, line),
                    () =>
                      show({
                        msg:
                          kind === "answered"
                            ? "Answered, with the word to the member."
                            : "Declined, with the word to the member.",
                        meta: `${row.proposer.toUpperCase()} · ${kind.toUpperCase()}`,
                        tone: kind === "answered" ? "positive" : "caution",
                      })
                  );
                }}
              >
                {ruling.kind === "answered" ? "Answer + tell them" : "Decline + tell them"}
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: 13 }}>
            {ruling?.kind === "answered"
              ? "The line below is the answer, and it reaches the member word for word — dates, a price, the next step."
              : "The line below reaches the member word for word. Left blank, they read “The Bridge passed on this one”."}
          </p>
          <Input
            label="The word to the member"
            placeholder={
              ruling?.kind === "answered"
                ? "What the Bridge can do, and when."
                : "Why it isn't sailing, said the way you'd say it to them."
            }
            value={charterNote}
            onChange={(e) => setCharterNote(e.target.value)}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
