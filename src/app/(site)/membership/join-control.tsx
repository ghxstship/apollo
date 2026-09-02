"use client";

import React from "react";
import { Button } from "@/components/ds";

/* — Per-cell dues control on the plan grid. Signed-in members only: anon
     visitors keep the application flow below the grid. — */

export function JoinControl({
  planId,
  action,
}: {
  planId: string;
  action: "join" | "switch" | "current";
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (action === "current") {
    return (
      <span className="ws-plans__note" style={{ color: "var(--laurel)" }}>
        YOUR STANDING
      </span>
    );
  }

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, interval: "month" }),
      });
      const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? "The processor is unavailable. Try again shortly.");
    } catch {
      setError("The processor is unavailable. Try again shortly.");
    }
    setPending(false);
  };

  return (
    <span style={{ display: "block", marginTop: 10 }}>
      <Button variant="outline" size="sm" disabled={pending} onClick={start}>
        {pending ? "Casting off…" : action === "switch" ? "Switch" : "Join"}
      </Button>
      {error ? (
        <span
          role="alert"
          style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--siren)", marginTop: 6 }}
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
