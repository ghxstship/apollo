"use client";

import React from "react";
import { Badge, Button } from "@/components/ds";
import { claimSeat, confirmSeat, pickFromTable, releaseSeat } from "./actions";

export type TableView = {
  id: string;
  number: number;
  seats: number;
  taken: number;
  nightTitle: string;
  nightWhen: string;
  started: boolean;
  mine: { state: "held" | "confirmed"; heldUntil: string } | null;
  seatmates: Array<{ id: string; name: string; picked: boolean }>;
};

export function TableCard({ table }: { table: TableView }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const t = table;
  const full = t.taken >= t.seats && !t.mine;

  const act = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div
      style={{
        border: "1px solid var(--line-faint)",
        background: "var(--surface-card)",
        padding: "18px 20px",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <b style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 19 }}>
          Table {t.number}
        </b>
        <span className="mbr-mono">{t.nightWhen}</span>
        <span style={{ marginLeft: "auto" }}>
          {t.mine?.state === "confirmed" ? (
            <Badge tone="positive">Seated</Badge>
          ) : t.mine?.state === "held" ? (
            <Badge tone="caution">Held</Badge>
          ) : full ? (
            <Badge tone="outline">Full</Badge>
          ) : (
            <span className="mbr-mono">{t.seats - t.taken} OF {t.seats} OPEN</span>
          )}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-2)" }}>
        Blind table for six · {t.nightTitle}
      </p>

      {!t.started ? (
        <div style={{ display: "flex", gap: 10 }}>
          {!t.mine ? (
            <Button size="sm" variant="gold" disabled={pending || full} onClick={() => act(() => claimSeat(t.id))}>
              Take a seat
            </Button>
          ) : t.mine.state === "held" ? (
            <>
              <Button size="sm" variant="gold" disabled={pending} onClick={() => act(() => confirmSeat(t.id))}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => releaseSeat(t.id))}>
                Let it go
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => releaseSeat(t.id))}>
              Give up the seat
            </Button>
          )}
        </div>
      ) : t.mine?.state === "confirmed" && t.seatmates.length > 0 ? (
        <div>
          <span className="mbr-mono" style={{ display: "block", marginBottom: 8 }}>
            WHO WOULD YOU MEET AGAIN — PRIVATE UNTIL MUTUAL
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {t.seatmates.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={m.picked ? "gold" : "outline"}
                disabled={pending || m.picked}
                onClick={() => act(() => pickFromTable(t.id, m.id))}
              >
                {m.picked ? `${m.name} — said` : m.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</p>
      ) : null}
    </div>
  );
}
