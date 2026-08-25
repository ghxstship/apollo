"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Input, Select, Stat, StateBlock, Toast } from "@/components/ds";
import {
  SEGMENTS,
  SEGMENT_HEADS,
  SEGMENT_LABEL,
  type Segment,
  type SegmentCapacityRow,
} from "@/lib/vetting";
import { offerTheNextPlace } from "../../../(member)/vetting/actions";
import { useToast } from "../../ui";
import { liftTheComposition, setTheComposition } from "./actions";

export type QueueLine = {
  segment: Segment;
  waiting: number;
  /** Offers whose six hours are still running. */
  offered: number;
  /** Offers whose six hours ran out and that nothing has swept yet. Shown
      rather than counted as outstanding — the seat is free again. */
  lapsed: number;
  claimed: number;
};

export function VoyagePicker({
  options,
  value,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  const router = useRouter();
  return (
    <Select
      label="Sailing"
      options={options}
      value={value}
      onChange={(e) => router.replace(`/bridge/composition?voyage=${e.target.value}`)}
      style={{ maxWidth: 420 }}
    />
  );
}

export function CompositionPanel({
  voyageId,
  voyageTitle,
  hull,
  rows,
  lines,
}: {
  voyageId: string;
  voyageTitle: string;
  /** Heads the hull carries net of operator holds — the number guard_the_ratio
      refuses against, and the only honest denominator for the head total. */
  hull: number;
  rows: SegmentCapacityRow[];
  lines: QueueLine[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [confirmLift, setConfirmLift] = React.useState(false);

  /* The draft ceilings belong to the sailing on screen, and the page mounts
     this panel under key={voyage.id} so switching the picker starts a fresh
     one. The alternative — resetting the draft from an effect — left the
     previous sailing's ceilings in the fields under the new sailing's name for
     one render, and that render is the one where somebody clicks Save. */
  const capOf = (s: Segment) => rows.find((r) => r.segment === s)?.cap ?? 0;
  const [draft, setDraft] = React.useState<Record<Segment, number>>({
    single_woman: capOf("single_woman"),
    single_man: capOf("single_man"),
    couple: capOf("couple"),
  });

  const gated = rows.length > 0;
  const draftHeads = SEGMENTS.reduce((n, s) => n + draft[s] * SEGMENT_HEADS[s], 0);
  /* Passes booked before this sailing was gated carry no segment and so appear
     in no cap row. They are aboard, they occupy the hull, and the ratio gate
     counts them — leaving them out of the figure the operator sets ceilings
     against is how a "Seated 0 / 32" is shown for a boat with two people on
     it. One head each: an unsegmented pass cannot be a couple. */
  const unsegmented = rows[0]?.unsegmented_aboard ?? 0;
  const seatedHeads =
    rows.reduce((n, r) => n + r.units * SEGMENT_HEADS[r.segment], 0) + unsegmented;
  const overHull = hull > 0 && draftHeads > hull;
  const dirty = SEGMENTS.some((s) => draft[s] !== capOf(s));
  /* A ceiling below the seats already sold does not unseat anybody — the
     capacity view floors `remaining` at nought — but it does mean the segment
     reads FULL to everyone from now on. Worth saying before the click, not
     after. */
  const underSold = SEGMENTS.filter((s) => {
    const row = rows.find((r) => r.segment === s);
    return row ? draft[s] < row.units : false;
  });

  const save = () =>
    startTransition(async () => {
      const res = await setTheComposition(voyageId, draft);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg: gated ? "Composition set." : "Composition set. This sailing is now ratio-gated.",
          meta: `${draftHeads} HEADS OF ${hull || draftHeads}`,
        });
    });

  const lift = () =>
    startTransition(async () => {
      const res = await liftTheComposition(voyageId);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        /* res.note names anyone released from the line. Lifting the ceilings
           dissolves the queue that was waiting on them, and the operator should
           be told that happened rather than discovering it later. */
        show({
          msg:
            "Composition lifted. The ratio gate and the vetting gate no longer run on this sailing." +
            (res.note ? ` ${res.note}` : ""),
          tone: res.note ? "caution" : undefined,
        });
      setConfirmLift(false);
    });

  const offer = (s: Segment) =>
    startTransition(async () => {
      const res = await offerTheNextPlace(voyageId, s);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else
        show({
          msg: `Offered to first in line, ${SEGMENT_LABEL[s].toLowerCase()}. One notice, six hours.`,
        });
    });

  const lineOf = (s: Segment) =>
    lines.find((l) => l.segment === s) ?? { segment: s, waiting: 0, offered: 0, lapsed: 0, claimed: 0 };

  return (
    <>
      <div className="hm-row">
        <Stat
          size="sm"
          label="Gate"
          value={gated ? "Running" : "Off"}
          sub={gated ? "RATIO AND VETTING ENFORCED" : "NO COMPOSITION ON THIS SAILING"}
        />
        <Stat
          size="sm"
          label="Seated"
          value={`${seatedHeads} / ${hull || "—"}`}
          sub={
            unsegmented > 0
              ? `HEADS · ${unsegmented} BOOKED BEFORE GATING`
              : "HEADS, COUPLES COUNT TWO"
          }
        />
        <Stat
          size="sm"
          label="Composition"
          value={`${draftHeads} heads`}
          sub={overHull ? "OVER THE HULL" : "AT THESE CEILINGS"}
        />
      </div>

      <section className="hm-sec">
        <div className="hm-head">
          <h2>The ceilings.</h2>
          <span className="hm-acts">
            {gated ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmLift(true)}>
                Lift the composition
              </Button>
            ) : null}
            <Button variant="gold" size="sm" disabled={pending || !dirty} onClick={save}>
              {gated ? "Save the composition" : "Gate this sailing"}
            </Button>
          </span>
        </div>
        <p className="hm-note">
          One ceiling per segment, in units. A couple is one pass and two heads,
          which is why the head total is not the sum of the three numbers. A
          segment at its ceiling offers the line and never another segment.
        </p>

        <div className="hm-form" style={{ marginTop: 18, maxWidth: 720 }}>
          {SEGMENTS.map((s) => {
            const row = rows.find((r) => r.segment === s);
            const line = lineOf(s);
            const remaining = row ? row.remaining : 0;
            return (
              <div className="hm-item" key={s}>
                <div className="hm-item__head">
                  <b>{SEGMENT_LABEL[s]}</b>
                  {row ? (
                    <Badge tone={remaining === 0 ? "caution" : "positive"}>
                      {remaining === 0 ? "Full" : `${remaining} left`}
                    </Badge>
                  ) : (
                    <Badge tone="outline">Not seated</Badge>
                  )}
                  <span className="hm-item__acts">
                    <Input
                      label="Ceiling"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={96}
                      value={String(draft[s])}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [s]: Math.max(0, Math.min(96, Math.round(Number(e.target.value) || 0))),
                        }))
                      }
                      style={{ width: 110 }}
                    />
                  </span>
                </div>
                <div className="hm-item__meta">
                  <span>
                    {row ? `${row.units} SOLD` : "0 SOLD"} · {SEGMENT_HEADS[s]} HEAD
                    {SEGMENT_HEADS[s] > 1 ? "S" : ""} PER PASS
                  </span>
                  <span>
                    {line.waiting === 0 ? "NOBODY WAITING" : `${line.waiting} WAITING`}
                    {line.offered ? ` · ${line.offered} OFFERED` : ""}
                    {line.lapsed ? ` · ${line.lapsed} LAPSED` : ""}
                  </span>
                  {line.waiting > 0 && remaining > 0 ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => offer(s)}>
                      Offer the next place
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {overHull ? (
          <p className="hm-note" role="status" style={{ color: "var(--caution)" }}>
            {draftHeads} heads against a hull of {hull}. The gate refuses the
            overflow at checkout, which is the worst place for a member to find
            out — raise the berths on the Voyages tab or lower a ceiling.
          </p>
        ) : null}
        {underSold.length ? (
          <p className="hm-note" role="status">
            {underSold.map((s) => SEGMENT_LABEL[s]).join(", ")} would sit below what is
            already sold. Nobody is unseated; the segment simply reads full from
            here on.
          </p>
        ) : null}
      </section>

      <Dialog
        open={confirmLift}
        onClose={() => setConfirmLift(false)}
        eyebrow="Lift the composition"
        title="Turn the gates off for this sailing?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLift(false)}>
              Leave it on
            </Button>
            <Button variant="gold" disabled={pending} onClick={lift}>
              Lift it
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
          {voyageTitle.replace(/\.+$/, "")} stops being ratio-gated. The segment
          gate stops counting, and the vetting gate stops running — a pass with
          no clearance and no verified identity will board.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--text-2)", marginTop: 10 }}>
          Passes already sold keep their seats. Nobody may be standing in the
          line when this happens.
        </p>
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}

export function NoSailings() {
  return (
    <StateBlock
      status="empty"
      icon="Sailboat"
      title="Nothing on the water."
      detail="A composition belongs to a sailing. Put one on the board from the Voyages tab and its three ceilings show here."
    />
  );
}
