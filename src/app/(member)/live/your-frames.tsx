"use client";

import React from "react";
import { Badge, Button, Notice } from "@/components/ds";
import { withdrawFrame } from "./actions";

export type OwnFrame = {
  id: string;
  caption: string | null;
  approved: boolean;
};

/* What you sent, and the way to take it back.

   A member could upload a frame from the moment the feature shipped and could
   never see one afterwards — the only listing was the Bridge's. The permission
   to withdraw has existed since August at the database line; what was missing
   was somewhere to stand while doing it.

   Deliberately not a gallery. The frames are shown by their caption and their
   standing, not by rendering the picture: signing a URL for each one costs a
   round trip per frame to show a member something they took ten minutes ago and
   already have on their phone. The question this block answers is "is it up,
   and can I stop that" — a thumbnail does not help with either.

   Withdrawal is immediate and it is not undoable, so it asks first. The word is
   "withdraw" rather than "delete" because that is what it is: the frame stops
   being the club's to show. */
export function YourFrames({ frames }: { frames: OwnFrame[] }) {
  /* Withdrawn ids, not a copy of the list. Holding the rows in state meant
     syncing them back from props in an effect, which the compiler refuses and
     is right to: the server revalidates on withdrawal and sends the real list
     down again. What local state is actually for here is the gap between the
     click and that round trip. */
  const [gone, setGone] = React.useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState<string | null>(null);

  const rows = frames.filter((f) => !gone.has(f.id));
  if (rows.length === 0) return null;

  async function withdraw(id: string) {
    setPending(id);
    setError(null);
    const res = await withdrawFrame(id);
    setPending(null);
    setAsking(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setGone((held) => new Set(held).add(id));
  }

  return (
    <div className="mbr-sub--lg">
      <span className="mbr-mono mbr-mono--block">
        WHAT YOU SENT
      </span>
      <ul className="mbr-list">
        {rows.map((f) => (
          <li key={f.id} className="frm-row">
            <span className="frm-row__cap">
              {f.caption?.trim() || "No line with it"}
            </span>
            <Badge tone={f.approved ? "positive" : "outline"}>
              {f.approved ? "On the water" : "With the Bridge"}
            </Badge>
            {asking === f.id ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending === f.id}
                  onClick={() => withdraw(f.id)}
                >
                  {pending === f.id ? "Taking it back…" : "Yes, take it back"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAsking(null)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAsking(f.id)}>
                Withdraw
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <Notice tone="danger" compact className="mbr-sub--xs">
          {error}
        </Notice>
      ) : null}
      <p className="ls-note mbr-sub--sm">
        Withdrawing takes the file down with the record, not just the listing. It does not
        come back.
      </p>
    </div>
  );
}
