"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Progress, Select, StateBlock, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { closePoll, createPoll, settlePoll } from "./actions";

export type PollView = {
  id: string;
  question: string;
  options: Array<{ label: string; votes: number }>;
  total: number;
  closesAt: string;
  open: boolean;
  settled: number | null;
};

export function PollsClient({ rows }: { rows: PollView[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [asking, setAsking] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState<string[]>(["", ""]);
  const [closesAt, setClosesAt] = React.useState("");
  const [settling, setSettling] = React.useState<PollView | null>(null);
  const [outcome, setOutcome] = React.useState("0");
  const [closing, setClosing] = React.useState<PollView | null>(null);

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const open = rows.filter((r) => r.open);
  const closed = rows.filter((r) => !r.open);

  const card = (p: PollView) => (
    <div className="hm-item" key={p.id}>
      <div className="hm-item__head">
        <b>{p.question}</b>
        {p.open ? <Badge tone="positive">Open</Badge> : p.settled !== null ? <Badge tone="ink">Settled</Badge> : <Badge tone="outline">Closed</Badge>}
        <div className="hm-item__acts">
          {p.open ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setClosing(p)}>
              Close early
            </Button>
          ) : p.settled === null ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => { setOutcome("0"); setSettling(p); }}>
              Settle
            </Button>
          ) : null}
        </div>
      </div>
      <div className="hm-item__meta">
        <span>{p.open ? "CLOSES" : "CLOSED"} {p.closesAt.toUpperCase()}</span>
        <span>·</span>
        <span>{p.total} {p.total === 1 ? "VOTE" : "VOTES"}</span>
      </div>
      <div className="hm-poll">
        {p.options.map((o, i) => (
          <Progress
            key={i}
            value={p.total ? (o.votes / p.total) * 100 : 0}
            tone={p.settled === i ? "positive" : undefined}
            label={
              <span>
                {o.label}
                {p.settled === i ? " — carried" : ""}
              </span>
            }
            detail={`${o.votes}`}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="hm-head hm-tabbody">
        <span className="hm-mono">
          {open.length} OPEN · {closed.length} CLOSED
        </span>
        <Button variant="gold" size="sm" onClick={() => { setQuestion(""); setOptions(["", ""]); setClosesAt(""); setAsking(true); }}>
          Ask a question
        </Button>
      </div>

      {rows.length ? (
        <>
          {open.map(card)}
          {closed.length ? (
            <section className="hm-sec">
              <h2>How it went.</h2>
              {closed.map(card)}
            </section>
          ) : null}
        </>
      ) : (
        <div className="hm-tabbody">
          <StateBlock status="empty" title="Nothing asked yet." detail="Ask the first question and it lands on Polls for every member until it closes." />
        </div>
      )}

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        width={520}
        eyebrow="New question"
        title="Ask the club."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                run(
                  () => createPoll(question, options, closesAt),
                  () => {
                    setAsking(false);
                    show({ msg: "Asked. It is on Polls now.", meta: "POLL OPEN" });
                  }
                )
              }
            >
              Ask it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Question"
            maxLength={200}
            placeholder="Which night for the October Table?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          {options.map((o, i) => (
            <Input
              key={i}
              label={`Answer ${i + 1}`}
              maxLength={80}
              value={o}
              onChange={(e) => setOptions((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
            />
          ))}
          <div className="hm-acts">
            <Button variant="ghost" size="sm" disabled={options.length >= 6} onClick={() => setOptions((s) => [...s, ""])}>
              Another answer
            </Button>
            <Button variant="ghost" size="sm" disabled={options.length <= 2} onClick={() => setOptions((s) => s.slice(0, -1))}>
              One fewer
            </Button>
          </div>
          <Input
            label="Closes"
            type="datetime-local"
            hint="On the club's clock. Voting stops on the hour."
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
          <p className="hm-note">A question is about the club, never about a person.</p>
        </div>
      </Dialog>

      <Dialog
        open={!!closing}
        onClose={() => setClosing(null)}
        width={420}
        eyebrow={closing ? closing.question : ""}
        title="Close this question now?"
        footer={
          closing ? (
            <>
              <Button variant="ghost" onClick={() => setClosing(null)}>
                Leave it open
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const p = closing;
                  setClosing(null);
                  run(() => closePoll(p.id), () => show({ msg: "Closed. Members see the count now.", meta: `${p.total} VOTES` }));
                }}
              >
                Close it
              </Button>
            </>
          ) : null
        }
      >
        <p className="hm-body">Voting stops at once and the count shows to every member. It cannot be reopened.</p>
      </Dialog>

      <Dialog
        open={!!settling}
        onClose={() => setSettling(null)}
        width={420}
        eyebrow={settling ? settling.question : ""}
        title="Which way did it go?"
        footer={
          settling ? (
            <>
              <Button variant="ghost" onClick={() => setSettling(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={pending}
                onClick={() => {
                  const p = settling;
                  setSettling(null);
                  run(() => settlePoll(p.id, Number(outcome)), () => show({ msg: "Settled.", meta: p.options[Number(outcome)]?.label.toUpperCase() ?? "" }));
                }}
              >
                Settle it
              </Button>
            </>
          ) : null
        }
      >
        {settling ? (
          <div className="hm-form">
            <Select
              label="Outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              options={settling.options.map((o, i) => ({ value: String(i), label: `${o.label} — ${o.votes}` }))}
            />
            <p className="hm-note">The count is the count; settling records what the club did with it.</p>
          </div>
        ) : null}
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
