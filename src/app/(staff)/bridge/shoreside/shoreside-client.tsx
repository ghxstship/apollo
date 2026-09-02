"use client";

import React from "react";
import { CLUB_ZONE } from "@/lib/brand";
import { Badge, Button, StateBlock, Textarea, Toast } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import { relTime, useToast } from "../../ui";
import { replyToThread } from "./actions";

export type ThreadCard = {
  id: string;
  title: string;
  member: string;
  memberNo: string;
  closed: boolean;
  lastAt: string;
  lastLine: string;
  waiting: boolean;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: string;
    staff: boolean;
  }>;
};

export function ShoresideClient({ threads }: { threads: ThreadCard[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [activeId, setActiveId] = React.useState(threads[0]?.id ?? "");
  const [draft, setDraft] = React.useState("");

  const active = threads.find((t) => t.id === activeId) ?? threads[0] ?? null;

  if (threads.length === 0) {
    return (
      <div style={{ marginTop: 24 }}>
        <StateBlock
          status="empty"
          title="Nothing from the shore."
          detail="When a member asks for a person, the thread opens here."
        />
      </div>
    );
  }

  const send = () => {
    if (!active) return;
    const line = draft;
    const threadId = active.id;
    startTransition(async () => {
      const res = await replyToThread(threadId, line);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        setDraft("");
        show({ msg: "Sent.", meta: "SHORESIDE · ON THE RECORD" });
      }
    });
  };

  return (
    <>
      <div className="hm-inbox">
        <div className="hm-inbox__list">
          {threads.map((t) => (
            <button
              type="button"
              key={t.id}
              className={["hm-inbox__row", t.id === active?.id ? "on" : ""].filter(Boolean).join(" ")}
              onClick={() => setActiveId(t.id)}
            >
              <b>{t.member}</b>
              <span>
                {t.memberNo} · {relTime(t.lastAt)}
                {t.waiting ? " · WAITING" : ""}
              </span>
              <em>{t.lastLine}</em>
            </button>
          ))}
        </div>

        {active ? (
          <div className="hm-inbox__pane">
            <div className="hm-item__head" style={{ padding: "14px 18px" }}>
              <b>{active.member}</b>
              {active.waiting ? <Badge tone="caution">Waiting on us</Badge> : null}
              {active.closed ? <Badge tone="outline">Closed</Badge> : null}
              <span className="hm-mono hm-item__acts">{active.memberNo}</span>
            </div>
            <div className="hm-inbox__log">
              {active.messages.length ? (
                active.messages.map((m) => (
                  <div
                    className={["hm-msg", m.staff ? "hm-msg--staff" : ""].filter(Boolean).join(" ")}
                    key={m.id}
                  >
                    <span>
                      {m.author.toUpperCase()} · {logDateTime(m.createdAt, CLUB_ZONE)}
                    </span>
                    <p>{m.body}</p>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
                  The thread is open and empty. Say the first thing.
                </p>
              )}
            </div>
            <div className="hm-inbox__reply">
              <Textarea
                label="Reply"
                rows={3}
                placeholder="We can hold two passes on the next episode afloat — say the word."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={active.closed}
              />
              <div className="hm-acts">
                <Button
                  variant="gold"
                  size="sm"
                  disabled={pending || active.closed || !draft.trim()}
                  onClick={send}
                >
                  Send reply
                </Button>
                <span className="hm-mono">
                  {active.closed ? "THREAD CLOSED — NOTHING SENDS" : "GOES TO THE MEMBER AS YOU"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
