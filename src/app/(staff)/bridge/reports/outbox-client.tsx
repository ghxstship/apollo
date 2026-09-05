"use client";

import React from "react";
import { Badge, Button, Table, Toast, cx, tableColumns } from "@/components/ds";
import { useToast } from "../../ui";
import { requeueOutbox, strikeOutbox, type OutboxTable } from "./actions";

/* One row across the three outboxes, already shaped by the server: what the
   letter was, who it was for, why it stopped, how many times it tried. */
export type StrandedRow = {
  key: string;
  table: OutboxTable;
  id: string;
  channel: "Email" | "SMS" | "Push";
  letter: string;
  recipient: string;
  status: "failed" | "skipped" | "sending";
  lastError: string | null;
  attempts: number;
  queued: string;
  [key: string]: unknown;
};

const STATE_LABEL: Record<StrandedRow["status"], string> = {
  failed: "Gave up",
  skipped: "Skipped",
  sending: "In flight",
};

/* State is the one column an operator scans this table for, and it was body
   text: "Gave up" and "Skipped" and "In flight" in the same weight and colour
   as the letter beside them, down fifty near-identical rows. A tone reads
   before the word does. */
const STATE_TONE: Record<StrandedRow["status"], "danger" | "caution" | "outline"> = {
  failed: "danger",
  skipped: "caution",
  sending: "outline",
};

/* And the row carries it too, so a run of failures is findable by shape at
   arm's length without reading a single cell. The stripe is a class on the
   row — .hm-outbox in bridge.css paints it inside the first cell, because a
   border on a <tr> in a collapsed table is negotiated away. The inline
   border-inline-start this used to set never drew. */
const STATE_CLASS: Record<StrandedRow["status"], string> = {
  failed: "is-failed",
  skipped: "is-skipped",
  sending: "",
};

const LEAVE_MS = 200;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function OutboxTable({ rows }: { rows: StrandedRow[] }) {
  const { toast, toastOpen, show, clear } = useToast();
  /* Which row's button is working, and what it is doing — so the one button
     says so and its neighbours stay usable. */
  const [busy, setBusy] = React.useState<{ key: string; what: "requeue" | "strike" } | null>(null);
  /* Rows the operator has just dealt with. They fade for a beat and go, ahead
     of the revalidation that removes them from the server's list. */
  const [gone, setGone] = React.useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = React.useState<Set<string>>(() => new Set());

  const dismiss = (key: string) => {
    if (reducedMotion()) {
      setGone((s) => new Set(s).add(key));
      return;
    }
    setLeaving((s) => new Set(s).add(key));
    setTimeout(() => setGone((s) => new Set(s).add(key)), LEAVE_MS);
  };

  const act = async (row: StrandedRow, what: "requeue" | "strike") => {
    setBusy({ key: row.key, what });
    try {
      const res = what === "requeue" ? await requeueOutbox(row.table, row.id) : await strikeOutbox(row.table, row.id);
      const meta = `${row.channel.toUpperCase()} · ${row.letter.toUpperCase()} · ${row.recipient.toUpperCase()}`;
      if (res.error) show({ msg: res.error, meta, tone: "danger" });
      else {
        show(
          what === "requeue"
            ? { msg: "Back in the queue. The next drain takes it.", meta }
            : { msg: "Struck. It will not be sent.", meta }
        );
        dismiss(row.key);
      }
    } finally {
      setBusy(null);
    }
  };

  const shown = rows.filter((r) => !gone.has(r.key));

  const columns = tableColumns<StrandedRow>([
    { key: "channel", label: "Channel" },
    { key: "letter", label: "Letter" },
    { key: "recipient", label: "To", mono: true },
    {
      key: "status",
      label: "State",
      render: (row) => <Badge tone={STATE_TONE[row.status]}>{STATE_LABEL[row.status]}</Badge>,
    },
    { key: "lastError", label: "What went wrong", render: (row) => row.lastError ?? "—" },
    { key: "attempts", label: "Tries", numeric: true },
    { key: "queued", label: "Queued", mono: true },
    {
      key: "act",
      label: "",
      render: (row) => {
        const mine = busy?.key === row.key ? busy.what : null;
        return row.status !== "sending" ? (
          <span className="ls-acts">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null && mine === null}
              pending={mine === "requeue"}
              pendingLabel="Requeuing…"
              onClick={() => void act(row, "requeue")}
            >
              Requeue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null && mine === null}
              pending={mine === "strike"}
              pendingLabel="Striking…"
              onClick={() => void act(row, "strike")}
            >
              Strike
            </Button>
          </span>
        ) : null;
      },
    },
  ]);

  return (
    <>
      <div className="hm-outbox">
        <Table
          dense
          columns={columns}
          rows={shown}
          rowKey={(row) => row.key}
          rowClassName={(row) => cx(STATE_CLASS[row.status], leaving.has(row.key) && "is-gone")}
        />
      </div>
      {toast ? (
        <Toast fixed open={toastOpen} message={toast.msg} meta={toast.meta} tone={toast.tone} onClose={clear} />
      ) : null}
    </>
  );
}
