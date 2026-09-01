"use client";

import React from "react";
import { Button } from "@/components/ds";
import { exportMyData } from "./export-actions";

/* — The member's record, as a file. The server action returns the JSON; the
     browser wraps it in a blob URL and offers the download from here, where
     an anchor click is the ordinary way to hand someone a file. — */
export function ExportDataButton({ memberNo }: { memberNo: string | null }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const download = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await exportMyData();
      if (res.error || !res.json) {
        setError(res.error ?? "That didn't land. Try again.");
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `un-member${memberNo ? `-${memberNo.replace(/\W+/g, "")}` : ""}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* Give the browser a beat to start the save before the URL goes. */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(true);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Button variant="outline" size="sm" disabled={pending} onClick={download}>
        {pending ? "Gathering it…" : "Export my data"}
      </Button>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--siren)" }}>
          {error}
        </span>
      ) : done ? (
        <span role="status" style={{ fontSize: 12, color: "var(--text-2)" }}>
          Saved as JSON.
        </span>
      ) : null}
    </div>
  );
}
