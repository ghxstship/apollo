"use client";

import React from "react";
import { Badge, Button, Dialog, Input, StateBlock, Toast } from "@/components/ds";
import { relTime, useToast } from "../../ui";
import { leaveUp, removeAndNotify } from "./actions";

export type FlagCard = {
  flagId: string;
  postId: string;
  authorId: string | null;
  authorName: string;
  reason: string;
  flaggedAt: string;
  body: string;
};

export function ModerationClient({ flags }: { flags: FlagCard[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [removing, setRemoving] = React.useState<FlagCard | null>(null);
  const [reason, setReason] = React.useState("");

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "siren" });
      else ok();
    });
  };

  if (flags.length === 0) {
    return (
      <div style={{ marginTop: 24 }}>
        <StateBlock
          status="empty"
          title="Queue's clear."
          detail="Nothing flagged. The Wardroom is behaving."
        />
      </div>
    );
  }

  return (
    <>
      {flags.map((f) => (
        <div className="hm-mod" key={f.flagId}>
          <div className="hm-mod__meta">
            <span>{f.authorName.toUpperCase()}</span>
            <span>·</span>
            <span>{relTime(f.flaggedAt)}</span>
            <Badge tone="clay">{f.reason}</Badge>
          </div>
          <p>&quot;{f.body}&quot;</p>
          <div className="hm-mod__acts">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setReason(f.reason);
                setRemoving(f);
              }}
            >
              Remove + notify
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => leaveUp(f.flagId),
                  () =>
                    show({
                      msg: "Left up. Eyes stay on the thread.",
                      meta: "LOGGED · NO ACTION",
                    })
                )
              }
            >
              Leave up
            </Button>
          </div>
        </div>
      ))}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={420}
        eyebrow={removing ? removing.authorName : ""}
        title="Remove from the Wardroom?"
        footer={
          removing ? (
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Not yet
              </Button>
              <Button
                variant="brass"
                disabled={pending}
                onClick={() => {
                  const f = removing;
                  const line = reason;
                  setRemoving(null);
                  run(
                    () => removeAndNotify(f.flagId, f.postId, f.authorId, line),
                    () =>
                      show({
                        msg: "Removed, author notified with the reason.",
                        meta: "CODE OF CONDUCT · LOGGED",
                        tone: "clay",
                      })
                  );
                }}
              >
                Remove + notify
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: 13 }}>
            The post comes down and the author gets the word with your reason on it — never
            silently.
          </p>
          <Input
            label="Reason"
            placeholder="Against the code of conduct."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
