"use client";

import React from "react";
import { Badge, Button, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { sendLetterToMe } from "./actions";

export type LetterRow = {
  code: string;
  /* What the row is called on screen; the code is the registry's key. */
  label: string;
  description: string;
  active: boolean;
  ruleCanSend: boolean;
  /* How many went out in the last 30 days, and how many are waiting. */
  sent: number;
  pending: number;
  skipped: number;
};

export function LettersClient({ rows }: { rows: LetterRow[] }) {
  /* The code of the letter being sent, so that one button says "Sending…"
     and the others stay themselves — one transition flag dimmed all forty. */
  const [sending, setSending] = React.useState<string | null>(null);
  const { toast, toastOpen, show, clear } = useToast();
  return (
    <>
      {rows.map((r) => (
        <div className="hm-item" key={r.code}>
          <div className="hm-item__head">
            <b>{r.label}</b>
            {r.active ? null : <Badge tone="outline">Retired</Badge>}
            {r.ruleCanSend ? <Badge tone="outline">A rule may send it</Badge> : <Badge tone="caution">Needs more than a rule carries</Badge>}
            <div className="hm-item__acts">
              <Button
                size="sm"
                variant="ghost"
                disabled={!r.active || (sending !== null && sending !== r.code)}
                pending={sending === r.code}
                pendingLabel="Sending…"
                onClick={async () => {
                  setSending(r.code);
                  try {
                    const res = await sendLetterToMe(r.code);
                    if (res.error) show({ msg: res.error, meta: r.label.toUpperCase(), tone: "danger" });
                    else show({ msg: res.note ?? "Queued.", meta: r.label.toUpperCase() });
                  } finally {
                    setSending(null);
                  }
                }}
              >
                Send to me
              </Button>
            </div>
          </div>
          <div className="hm-item__meta">
            <span>{r.sent} SENT · 30 DAYS</span>
            <span>·</span>
            <span>{r.pending} WAITING</span>
            <span>·</span>
            <span>{r.skipped} SKIPPED</span>
          </div>
          <div className="hm-item__body">{r.description}</div>
        </div>
      ))}
      {toast ? <Toast fixed open={toastOpen} message={toast.msg} meta={toast.meta} tone={toast.tone} onClose={clear} /> : null}
    </>
  );
}
