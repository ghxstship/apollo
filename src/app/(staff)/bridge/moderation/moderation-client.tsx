"use client";

import React from "react";
import { Button, Dialog, Input, Toast } from "@/components/ds";
import { FlagQueue, type FlagItem } from "@/components/ds/feed";
import { relTime, useToast } from "../../ui";
import { leaveUp, removeAndNotify } from "./actions";

/* The Bridge's flag queue — the kit's FlagQueue table drives resolution.
   "Leave it up" resolves in one motion; "Remove the post" opens the reason
   dialog, because the author is always told why — never silently. */

export type FlagCard = {
  flagId: string;
  /* Null when the post is already gone — the flag is still resolvable. */
  postId: string | null;
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
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const items: FlagItem[] = flags.map((f) => ({
    id: f.flagId,
    author: f.authorName,
    excerpt: f.body.length > 90 ? f.body.slice(0, 90) + "…" : f.body,
    flaggedBy: f.reason.toUpperCase(),
    when: relTime(f.flaggedAt),
  }));

  return (
    <>
      <div style={{ marginTop: 24 }}>
        <FlagQueue
          items={items}
          onResolve={(item, action) => {
            const f = flags.find((x) => x.flagId === item.id);
            if (!f) return;
            if (action === "leave") {
              run(
                () => leaveUp(f.flagId),
                () => show({ msg: "Left up. Eyes stay on the thread.", meta: "LOGGED · NO ACTION" })
              );
            } else {
              setReason(f.reason);
              setRemoving(f);
            }
          }}
        />
      </div>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        width={420}
        eyebrow={removing ? removing.authorName : ""}
        title="Remove from the Open Deck?"
        footer={
          removing ? (
            <>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
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
                        tone: "caution",
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
            The post comes down and the author gets the word with your reason on
            it — never silently.
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
