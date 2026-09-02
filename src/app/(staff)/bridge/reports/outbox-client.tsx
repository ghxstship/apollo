"use client";

import React from "react";
import { Badge, Button, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { requeueOutbox, type OutboxTable } from "./actions";

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
   arm's length without reading a single cell. */
const STATE_STRIPE: Record<StrandedRow["status"], string> = {
  failed: "var(--danger)",
  skipped: "var(--caution)",
  sending: "transparent",
};

export function OutboxTable({ rows }: { rows: StrandedRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  return (
    <>
      <div className="ls-table-wrap" style={{ marginBottom: 16 }}>
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
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                style={{ borderInlineStart: `3px solid ${STATE_STRIPE[row.status]}` }}
              >
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
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await requeueOutbox(row.table, row.id);
                          if (res.error) show({ msg: res.error, tone: "danger" });
                          else
                            show({
                              msg: "Back in the queue. The next drain takes it.",
                              meta: `${row.channel.toUpperCase()} · ${row.letter.toUpperCase()}`,
                            });
                        })
                      }
                    >
                      Requeue
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
