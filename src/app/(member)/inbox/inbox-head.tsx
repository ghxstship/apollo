"use client";

import React from "react";
import { Button } from "@/components/ds";
import { archiveRead, markAllRead } from "./actions";

/* The standfirst and the two sweeps. Both were bare <form action> posts with
   no pending state: the button stayed live, the count stayed put, and on a
   slow link a member pressed Mark all read twice and wondered which had
   taken. The count now reads the sweep as the finger lifts — "All read." at
   once, the Archive button gone at once — and the server's re-render is the
   truth a round trip later. A refusal restores the head and says why, under
   the buttons that asked. Same shape as the ballot and the pass release.

   The list itself is the server's; the wrapper carries aria-busy while a
   sweep is in flight so the rows dim rather than sit there looking final. */
export function InboxHead({
  unread,
  readShown,
  children,
}: {
  unread: number;
  readShown: number;
  children: React.ReactNode;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [shown, patch] = React.useOptimistic(
    { unread, readShown },
    (cur, next: Partial<{ unread: number; readShown: number }>) => ({ ...cur, ...next })
  );

  const sweep = (fn: () => Promise<{ error?: string }>, next: Partial<{ unread: number; readShown: number }>) => {
    setError(null);
    start(async () => {
      patch(next);
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="wrd-sweep" aria-busy={pending || undefined}>
      <div className="wrd-head wrd-head--first">
        <p className="wrd-head__count" role="status">
          {shown.unread ? `${shown.unread} new.` : "All read."}
        </p>
        <div className="wrd-head__acts">
          {shown.unread > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => sweep(markAllRead, { unread: 0 })}
            >
              Mark all read
            </Button>
          ) : null}
          {shown.readShown > 0 ? (
            /* What has been read can go; the unread stay where they are. */
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => sweep(archiveRead, { readShown: 0 })}
            >
              Archive read
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mbr-alert">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
