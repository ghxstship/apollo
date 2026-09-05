"use client";

/* Offers waiting on you, at the top of Passes. Accepting runs the RPC
   that reassigns the pass, clears the code and squares both accounts — it
   posts to the Inbox itself, so nothing is notified from here. */

import React from "react";
import { Button, Notice } from "@/components/ds";
import { acceptOffer, declineOffer } from "./actions";

export type IncomingOffer = {
  id: string;
  fromName: string;
  voyageTitle: string;
  meta: string;
};

export function TransferInbox({ offers }: { offers: IncomingOffer[] }) {
  const [pending, startTransition] = React.useTransition();
  /* Which offer, and which answer. Accept and Decline share one transition, so
     without this both would read as working when only one was pressed. */
  const [running, setRunning] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (offers.length === 0) return null;

  const act = (key: string, fn: () => Promise<{ error?: string }>) => {
    setError(null);
    setRunning(key);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      setRunning(null);
    });
  };

  return (
    <div className="mbr-sec">
      {offers.map((o) => (
        <div key={o.id} className="mbr-panel mbr-panel--strong xfr-offer" aria-busy={pending || undefined}>
          <span className="mbr-mono">{o.meta}</span>
          <div className="xfr-offer__line">
            {o.fromName} offers you a pass — {o.voyageTitle}
          </div>
          <p className="ls-note mbr-line">
            Take it and the pass is yours: a new code is cut, and what they paid
            moves to your account.
          </p>
          <div className="ls-acts mbr-sub--sm">
            <Button
              variant="gold"
              size="sm"
              disabled={pending}
              pending={running === `accept:${o.id}`}
              pendingLabel="Taking it…"
              onClick={() => act(`accept:${o.id}`, () => acceptOffer(o.id))}
            >
              Accept the pass
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              pending={running === `decline:${o.id}`}
              pendingLabel="Declining…"
              onClick={() => act(`decline:${o.id}`, () => declineOffer(o.id))}
            >
              Decline
            </Button>
          </div>
          {error ? (
            <Notice tone="danger" compact className="mbr-sub--xs">
              {error}
            </Notice>
          ) : null}
        </div>
      ))}
    </div>
  );
}
