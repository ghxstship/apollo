"use client";

import React from "react";
import { Badge, Button, Toast } from "@/components/ds";
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
  const { toast, show, clear } = useToast();
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

  return (
    <>
      <div className="ls-table-wrap hm-outbox">
        <table className="ls-table ls-table--dense">
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Letter</th>
              <th scope="col">To</th>
              <th scope="col">State</th>
              <th scope="col">What went wrong</th>
              <th scope="col" className="num--end">Tries</th>
              <th scope="col">Queued</th>
              <th scope="col"><span className="ls-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const mine = busy?.key === row.key ? busy.what : null;
              return (
                <tr key={row.key} className={[STATE_CLASS[row.status], leaving.has(row.key) ? "is-gone" : ""].filter(Boolean).join(" ") || undefined}>
                  <td>{row.channel}</td>
                  <td>{row.letter}</td>
                  <td className="num">{row.recipient}</td>
                  <td>
                    <Badge tone={STATE_TONE[row.status]}>{STATE_LABEL[row.status]}</Badge>
                  </td>
                  <td>{row.lastError ?? "—"}</td>
                  <td className="num num--end">{row.attempts}</td>
                  <td className="num">{row.queued}</td>
                  <td>
                    {row.status !== "sending" ? (
                      <span className="hm-acts">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null && mine === null}
                          aria-busy={mine === "requeue" || undefined}
                          onClick={() => void act(row, "requeue")}
                        >
                          {mine === "requeue" ? "Requeuing…" : "Requeue"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null && mine === null}
                          aria-busy={mine === "strike" || undefined}
                          onClick={() => void act(row, "strike")}
                        >
                          {mine === "strike" ? "Striking…" : "Strike"}
                        </Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
