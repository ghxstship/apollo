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
  const [error, setError] = React.useState<string | null>(null);

  if (offers.length === 0) return null;

  const act = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
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
              onClick={() => act(() => acceptOffer(o.id))}
            >
              Accept the pass
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => act(() => declineOffer(o.id))}
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
