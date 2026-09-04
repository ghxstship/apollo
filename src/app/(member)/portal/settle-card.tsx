"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";
import { CARD_UNAVAILABLE } from "@/lib/errors";

/* — Settle a negative house-account balance by card via Stripe Checkout.
     Rendered only when the server says card payments are wired. — */

export function SettleCardButton({ amountLabel }: { amountLabel: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const settle = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? CARD_UNAVAILABLE);
    } catch {
      setError(CARD_UNAVAILABLE);
    }
    setPending(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Button variant="outline" size="sm" disabled={pending} onClick={settle}>
        {pending ? "Casting off…" : `Settle ${amountLabel} with card`}
      </Button>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--siren)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* — Shown once when Checkout returns with ?settled=1 — */
export function SettledNotice() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <Toast
      fixed
      tone="positive"
      message="Payment received — the ledger updates when the card clears."
      onDismiss={() => setOpen(false)}
    />
  );
}
