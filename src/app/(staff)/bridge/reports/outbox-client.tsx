"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";
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
              <th scope="col">Tries</th>
              <th scope="col">Queued</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.channel}</td>
                <td>{row.letter}</td>
                <td className="num">{row.recipient}</td>
                <td>{STATE_LABEL[row.status]}</td>
                <td>{row.lastError ?? "—"}</td>
                <td className="num">{row.attempts}</td>
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
