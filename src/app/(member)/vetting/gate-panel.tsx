"use client";

import React from "react";
import { Button, Input } from "@/components/ds";
import {
  SEGMENTS,
  SEGMENT_CHOICE,
  SEGMENT_LABEL,
  isFull,
  remainingToken,
  seatedHeads,
  hullHeads,
  type Segment,
  type SegmentCapacityRow,
  type WaitlistRow,
} from "@/lib/vetting";
import { claimYourPlace, joinTheLine, leaveTheLine, takeASeat } from "./actions";
import { PARTNER_NAME_MAX, isPartnerName } from "./partner";

/* The ratio gate, guest side. Two rules from the kit are load-bearing here and
   both are about what this component does NOT do:

   1. "CAPACITY IS SHOWN BY SEGMENT, NEVER AS ONE NUMBER." The head count is set
      beside the segment rows as a second figure, never instead of them, and
      there is no code path that renders the total alone.
   2. "A FULL SEGMENT OFFERS THE WAITLIST, NEVER AN UPSELL TO ANOTHER SEGMENT."
      When the chosen segment is full the only control offered is the line for
      THAT segment. Suggesting the segment with room would be selling a member a
      different life than the one they asked for. */

export function GatePanel({
  voyageId,
  title,
  when,
  rows,
  hull,
  mySegment,
  myPartner,
  myLine,
}: {
  voyageId: string;
  title: string;
  when: string;
  rows: SegmentCapacityRow[];
  /** Heads the hull actually holds, net of operator holds — the number
      guard_the_ratio refuses against. */
  hull: number;
  mySegment: Segment | null;
  /** The second head on a couple pass, as the manifest reads it. */
  myPartner: string | null;
  myLine: WaitlistRow | null;
}) {
  const [choice, setChoice] = React.useState<Segment | null>(mySegment);
  /* The second head. A couple is two people on one pass; the seat is not
     offered until the other one is named. */
  const [partner, setPartner] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const needsPartner = choice === "couple";
  const partnerReady = !needsPartner || isPartnerName(partner);

  const byId = new Map(rows.map((r) => [r.segment, r]));
  const chosen = choice ? byId.get(choice) ?? null : null;
  const heads = seatedHeads(rows);
  /* The denominator is the HULL, not the sum of the segment caps. They coincide
     at the standard composition — 10 + 10 + 10×2 = 40 — and they stop coinciding
     the moment someone raises a cap for one sailing, at which point summing the
     caps would print "34 of 44" on a boat certified for 40. The number a guest
     reads has to be the number the gate enforces. hullHeads is the fallback for
     a sailing whose berth count did not come through. */
  const capacity = hull > 0 ? hull : hullHeads(rows);

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="vet-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-3)" }}>
        <span className="vet-eyebrow">Capacity by segment</span>
        {/* The head total, second and quieter. 34 of 40 is only true because a
            couple counts two — the same arithmetic the database holds. */}
        <span className="vet-eyebrow">{heads} of {capacity} seated</span>
      </div>
      <p className="vet-title">{title}</p>
      <p className="vet-note">{when}</p>

      <div>
        {SEGMENTS.map((s) => {
          const row = byId.get(s);
          if (!row) return null;
          return (
            <div className="vet-row" key={s}>
              <span className="vet-row__label">{SEGMENT_LABEL[s]}</span>
              <span className="vet-row__value">
                {row.units} of {row.cap}
              </span>
              <span
                className="vet-row__token"
                style={{ color: isFull(row) ? "var(--danger)" : "var(--positive)" }}
              >
                {remainingToken(row)}
              </span>
            </div>
          );
        })}
      </div>

      {mySegment ? (
        <div className="vet-strip vet-strip--queue">
          <span className="vet-strip__badge">On the manifest</span>
          <span className="vet-strip__title">You are aboard.</span>
          <p className="vet-strip__body">
            Your pass is a {SEGMENT_CHOICE[mySegment].toLowerCase()}.
            {mySegment === "couple" && myPartner ? ` Second head — ${myPartner}.` : ""} Radar
            opens at 17:15, on open water.
          </p>
        </div>
      ) : myLine ? (
        <div className="vet-strip vet-strip--queue">
          <span className="vet-strip__badge">
            Position {String(myLine.place).padStart(2, "0")} · {SEGMENT_LABEL[myLine.segment]}
          </span>
          <span className="vet-strip__title">
            {myLine.place === 1 ? "You are first in line." : "You are in line."}
          </span>
          <p className="vet-strip__body">
            {myLine.offered_at && !myLine.claimed_at && !myLine.released_at
              ? "A seat opened. It is yours for six hours, then it passes to the next in line."
              : "If a seat opens we write once. You get six hours to claim it, then it passes to the next in line."}
          </p>
          <div className="vet-acts">
            {myLine.offered_at && !myLine.claimed_at && !myLine.released_at ? (
              <Button size="sm" onClick={() => run(() => claimYourPlace(myLine.id))} disabled={pending}>
                Claim the seat
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => run(() => leaveTheLine(myLine.id))} disabled={pending}>
              Leave the line
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="vet-chips" role="group" aria-label="Which seat">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                className="vet-chip"
                aria-pressed={choice === s}
                onClick={() => setChoice(s)}
              >
                {SEGMENT_CHOICE[s]}
              </button>
            ))}
          </div>

          {chosen && isFull(chosen) ? (
            /* The kit's refusal, verbatim in shape: honest, not apologetic. It
               names the number and the way forward, and it offers exactly one
               control — the line for the segment that is full. */
            <div className="vet-strip vet-strip--refusal">
              <span className="vet-strip__badge">Segment full</span>
              <span className="vet-strip__title">This sailing is balanced out.</span>
              <p className="vet-strip__body">
                {chosen.cap} seats, {chosen.units} taken. The waitlist runs in order.
              </p>
              <div className="vet-acts">
                <Button size="sm" onClick={() => run(() => joinTheLine(voyageId, chosen.segment))} disabled={pending}>
                  Join the line
                </Button>
              </div>
            </div>
          ) : (
            <>
              {needsPartner ? (
                /* Asked before the seat, not after: a couple pass with one head
                   named is a pass the gangway cannot fully admit. The name gets
                   its own boarding code and its own waiver link, and it never
                   counts as a guest. */
                <Input
                  label="Second head — as the manifest reads it"
                  required
                  value={partner}
                  maxLength={PARTNER_NAME_MAX}
                  autoComplete="off"
                  onChange={(e) => setPartner(e.target.value)}
                  hint="They get their own boarding code and sign their own waiver."
                  style={{ marginTop: "var(--space-3)" }}
                />
              ) : null}
              <div className="vet-acts">
                <Button
                  size="sm"
                  onClick={() => choice && run(() => takeASeat(voyageId, choice, partner))}
                  disabled={pending || !choice || !partnerReady}
                >
                  Take the seat
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {error ? (
        /* The refusal is named. Every message that reaches here came from a
           trigger that raised in the club's voice — which segment is full, what
           the hull holds, that the clearance lapsed and when — or from
           voiceWith, which asked the database whether the membership is paused
           before saying so. */
        <p className="vet-note" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <p className="vet-note">
        A full segment offers the waitlist, never a seat in another segment.
      </p>
    </div>
  );
}
