"use client";

import React from "react";
import { Badge, Button, Checkbox, Notice } from "@/components/ds";
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

type Seat = TableView["mine"];

/* What the card shows of the seat before the server has answered. The chair
   is taken as the finger lifts; the RPC's answer — the hold, the capacity
   race, a refusal in the club's voice — settles it a round trip later, and a
   refusal puts the card back exactly as it was, with the reason under it. */
type Shown = { mine: Seat; taken: number };

export function TableCard({ table }: { table: TableView }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  /* Whether the next pick also tells the Bridge "sit me near them again". It
     rides on the pick row and cannot be added after, so it is decided first. */
  const [again, setAgain] = React.useState(false);
  const t = table;
  /* Same pattern as the ballot and the pass release: the server's row is the
     truth, and this is only what the card reads until it arrives. */
  const [shown, setShown] = React.useOptimistic<Shown, Shown>(
    { mine: t.mine, taken: t.taken },
    (_, next) => next
  );
  const full = shown.taken >= t.seats && !shown.mine;

  /* Which control is working. Confirm and Let it go stand side by side and the
     seatmate picks are a row of them, all on one transition — without a name
     for the pressed one they would all read as busy. */
  const [running, setRunning] = React.useState<string | null>(null);

  const act = (key: string, fn: () => Promise<{ error?: string }>, next?: Shown) => {
    setError(null);
    setRunning(key);
    start(async () => {
      if (next) setShown(next);
      const res = await fn();
      if (res.error) setError(res.error);
      setRunning(null);
    });
  };

  const take = () =>
    act("take", () => claimSeat(t.id), { mine: { state: "held", heldUntil: "" }, taken: shown.taken + 1 });
  const confirm = () =>
    act("confirm", () => confirmSeat(t.id), { mine: { state: "confirmed", heldUntil: "" }, taken: shown.taken });
  const letGo = () =>
    act("release", () => releaseSeat(t.id), { mine: null, taken: Math.max(0, shown.taken - 1) });

  return (
    <div className="tbl-card" aria-busy={pending || undefined}>
      <div className="tbl-card__head">
        {/* Below the 22px Anton floor a title is Archivo 700, sentence case. */}
        <b className="mbr-title">Table {t.number}</b>
        <span className="mbr-mono">{t.nightWhen}</span>
        <span className="tbl-card__state">
          {shown.mine?.state === "confirmed" ? (
            <Badge tone="positive" key="seated">Seated</Badge>
          ) : shown.mine?.state === "held" ? (
            <Badge tone="caution" key="held">Held</Badge>
          ) : full ? (
            <Badge tone="outline" key="full">Full</Badge>
          ) : (
            <span className="mbr-mono">{t.seats - shown.taken} OF {t.seats} OPEN</span>
          )}
        </span>
      </div>
      <p className="ls-note mbr-note--lg mbr-line">Blind table for six · {t.nightTitle}</p>

      {!t.started ? (
        <div className="tbl-card__acts">
          {!shown.mine ? (
            <Button
              size="sm"
              variant="gold"
              disabled={pending || full}
              pending={running === "take"}
              pendingLabel="Taking…"
              onClick={take}
            >
              Take a seat
            </Button>
          ) : shown.mine.state === "held" ? (
            <>
              <Button
                size="sm"
                variant="gold"
                disabled={pending}
                pending={running === "confirm"}
                pendingLabel="Confirming…"
                onClick={confirm}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                pending={running === "release"}
                pendingLabel="Letting go…"
                onClick={letGo}
              >
                Let it go
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              pending={running === "release"}
              pendingLabel="Giving it up…"
              onClick={letGo}
            >
              Give up the seat
            </Button>
          )}
        </div>
      ) : t.mine?.state === "confirmed" && t.seatmates.length > 0 ? (
        <div>
          <span className="mbr-mono mbr-mono--block mbr-line">
            WHO WOULD YOU MEET AGAIN — PRIVATE UNTIL MUTUAL
          </span>
          <div className="tbl-card__picks mbr-sub--sm">
            {t.seatmates.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={m.picked ? "gold" : "outline"}
                aria-pressed={m.picked}
                disabled={pending || m.picked}
                /* No pendingLabel: the label is the seatmate's name. */
                pending={running === `pick:${m.id}`}
                onClick={() => act(`pick:${m.id}`, () => pickFromTable(t.id, m.id, again))}
              >
                {m.picked ? `${m.name} — said` : m.name}
              </Button>
            ))}
          </div>
          {t.seatmates.some((m) => !m.picked) ? (
            <Checkbox
              checked={again}
              onChange={(e) => setAgain(e.target.checked)}
              disabled={pending}
              label="Also tell the Bridge I'd sit near them again"
              description="A seating hint for the next Table night. Never shown to anyone at the table."
              className="mbr-sub--sm"
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Notice tone="danger" compact className="mbr-sub--xs">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
