"use client";

import React from "react";
import { Button, Toast } from "@/components/ds";
import { price } from "@/lib/format";
import { CARD_UNAVAILABLE } from "@/lib/errors";

/* — Billing islands. Every write goes through the Stripe routes; these only
     hand the member off and report back when the processor is quiet. — */

/* The sentence itself now lives in @/lib/errors, declared once: it stood three
   times across two files, and drifting copies of a refusal are how two surfaces
   end up saying different things about the same outage. */

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
    return data.error ?? CARD_UNAVAILABLE;
  } catch {
    return CARD_UNAVAILABLE;
  }
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span role="alert" className="mbr-alert mbr-alert--inline">
      {message}
    </span>
  );
}

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
      <div className="acc-opt">
        <span>
          <b className="acc-opt__name">Monthly</b>
          <span className="acc-opt__line">
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
        <div className="acc-opt">
          <span>
            <b className="acc-opt__name">Annual</b>
            <span className="acc-opt__line">
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
        <div className="mbr-sub--sm">
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
    <div className="mbr-acts">
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
