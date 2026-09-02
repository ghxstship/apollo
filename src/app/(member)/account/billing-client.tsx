"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";
import { price } from "@/lib/format";

/* — Billing islands. Every write goes through the Stripe routes; these only
     hand the member off and report back when the processor is quiet. — */

const UNAVAILABLE = "The processor is unavailable. Try again shortly.";

async function handOff(url: string, body?: unknown): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "POST",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.assign(data.url);
      return "";
    }
    return data.error ?? UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span role="alert" style={{ fontSize: 12, color: "var(--siren)" }}>
      {message}
    </span>
  );
}

const optionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  padding: "14px 0",
  borderTop: "1px solid var(--line-faint)",
};

/* — Monthly against annual for the standing already held. Annual is ten
     months of dues: two months on the house. — */
export function StandingControls({
  planId,
  monthlyCents,
  annualCents,
  currentInterval,
}: {
  planId: string;
  monthlyCents: number;
  annualCents: number | null;
  currentInterval: "month" | "year" | null;
}) {
  const [pending, setPending] = React.useState<"month" | "year" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const go = (interval: "month" | "year") => {
    setPending(interval);
    setError(null);
    void handOff("/api/stripe/subscribe", { planId, interval }).then((message) => {
      if (message) {
        setError(message);
        setPending(null);
      }
    });
  };

  const label = (interval: "month" | "year") => {
    if (pending === interval) return "Casting off…";
    if (currentInterval === interval) return "Your standing";
    return currentInterval ? "Move to this" : "Take this standing";
  };

  return (
    <div>
      <div style={optionStyle}>
        <span>
          <b style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>Monthly</b>
          <span style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
            {price(monthlyCents)} every month.
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pending !== null || currentInterval === "month"}
          onClick={() => go("month")}
        >
          {label("month")}
        </Button>
      </div>
      {annualCents ? (
        <div style={optionStyle}>
          <span>
            <b style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>Annual</b>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
              {price(annualCents)} a year — two months on the house.
            </span>
          </span>
          <Button
            variant={currentInterval === "year" ? "outline" : "gold"}
            size="sm"
            disabled={pending !== null || currentInterval === "year"}
            onClick={() => go("year")}
          >
            {label("year")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 10 }}>
          <ErrorLine message={error} />
        </div>
      ) : null}
    </div>
  );
}

/* — Card, cancellation, and receipts live in Stripe's own portal. — */
export function ManageBillingButton() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const open = () => {
    setPending(true);
    setError(null);
    void handOff("/api/stripe/portal").then((message) => {
      if (message) {
        setError(message);
        setPending(false);
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Button variant="outline" size="sm" disabled={pending} onClick={open}>
        {pending ? "Casting off…" : "Manage in Stripe"}
      </Button>
      <ErrorLine message={error} />
    </div>
  );
}

/* — Shown once when Checkout returns with ?joined=1 — */
export function JoinedNotice() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <Toast
      fixed
      tone="positive"
      message="Aboard. Dues are running."
      onDismiss={() => setOpen(false)}
    />
  );
}
