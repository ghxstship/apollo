"use client";

/* Offers waiting on you, at the top of the manifest. Accepting runs the RPC
   that reassigns the pass, clears the code and squares both accounts — it
   posts the Word itself, so nothing is notified from here. */

import React from "react";
import { Button } from "@/components/ds";
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
        <div
          key={o.id}
          style={{
            border: "1px solid var(--line-strong)",
            background: "var(--surface-card)",
            padding: "16px 18px",
            marginBottom: 10,
          }}
        >
          <span className="mbr-mono">{o.meta}</span>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            {o.fromName} offers you a pass — {o.voyageTitle}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, maxWidth: "48ch" }}>
            Take it and the pass is yours: a new code is cut, and what they paid
            moves to your account.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
            <p className="voy-hold" role="alert" style={{ marginTop: 10 }}>
              {error}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
