"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Input, Select, StateBlock, Textarea, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import {
  liftLegHold,
  postLegHold,
  removeLeg,
  removeStop,
  saveLeg,
  saveStop,
} from "./actions";

export type LegRow = {
  id: string;
  day: number;
  port: string;
  note: string | null;
  /** Pre-formatted on the sailing's clock, and the wall-clock form for the field. */
  when: string | null;
  whenLocal: string;
  status: "planned" | "revised" | "held";
  holdReason: string | null;
  holdNewPlan: string | null;
  holdUnchanged: string | null;
  stops: number;
};

export type StopRow = {
  id: string;
  position: number;
  name: string;
  legId: string | null;
  tenderAt: string;
  lastReturn: string;
  notes: string | null;
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
      onChange={(e) => router.replace(`/bridge/itinerary?voyage=${e.target.value}`)}
      style={{ maxWidth: 420 }}
    />
  );
}

const BLANK_LEG = { day: "1", port: "", note: "", startsAt: "" };
const BLANK_STOP = { position: "1", name: "", legId: "", tenderAt: "", lastReturn: "", notes: "" };
const BLANK_HOLD = { reason: "", newPlan: "", unchanged: "" };

function statusTone(s: LegRow["status"]): "positive" | "caution" | "outline" {
  if (s === "held") return "caution";
  if (s === "revised") return "outline";
  return "positive";
}

export function ItineraryClient({
  voyageId,
  legs,
  stops,
}: {
  voyageId: string;
  legs: LegRow[];
  stops: StopRow[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  const [legForm, setLegForm] = React.useState<{ id: string | null; f: typeof BLANK_LEG } | null>(null);
  const [stopForm, setStopForm] = React.useState<{ id: string | null; f: typeof BLANK_STOP } | null>(null);
  const [holdFor, setHoldFor] = React.useState<LegRow | null>(null);
  const [hold, setHold] = React.useState(BLANK_HOLD);
  const [confirmLeg, setConfirmLeg] = React.useState<LegRow | null>(null);

  const legOptions = [
    { value: "", label: "Not filed under a leg" },
    ...legs.map((l) => ({ value: l.id, label: `Day ${l.day} — ${l.port}` })),
  ];

  const run = (fn: () => Promise<{ error?: string }>, said: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: said });
        after?.();
      }
    });

  const nextDay = legs.length ? Math.max(...legs.map((l) => l.day)) + 1 : 1;
  const nextPosition = stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 1;

  return (
    <>
      {/* — legs — */}
      <section className="hm-sec">
        <div className="hm-head">
          <h2>The legs.</h2>
          <span className="hm-acts">
            <Button
              variant="gold"
              size="sm"
              onClick={() => setLegForm({ id: null, f: { ...BLANK_LEG, day: String(nextDay) } })}
            >
              Add a leg
            </Button>
          </span>
        </div>
        <p className="hm-note">
          One row per day, in order. A leg is what a member reads as the
          itinerary — until there is one, the charter page has no itinerary at
          all and says nothing about where the boat is going.
        </p>

        {legs.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Map"
            title="No legs posted."
            detail="The itinerary block does not render on a charter with no legs. Add day one and it appears, for every member holding a pass."
          />
        ) : (
          legs.map((leg) => (
            <div className="hm-item" key={leg.id}>
              <div className="hm-item__head">
                <b>
                  Day {leg.day} — {leg.port}
                </b>
                <Badge tone={statusTone(leg.status)}>
                  {leg.status === "held" ? "Held" : leg.status === "revised" ? "Revised" : "Planned"}
                </Badge>
                <span className="hm-item__acts">
                  {leg.status === "held" ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => liftLegHold(leg.id, true), "Hold lifted. The leg reads revised.")}
                      >
                        Lift as revised
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => liftLegHold(leg.id, false), "Hold lifted. The leg is back to plan.")}
                      >
                        Back to plan
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setHold(BLANK_HOLD);
                        setHoldFor(leg);
                      }}
                    >
                      Post a hold
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      setLegForm({
                        id: leg.id,
                        f: {
                          day: String(leg.day),
                          port: leg.port,
                          note: leg.note ?? "",
                          startsAt: leg.whenLocal,
                        },
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmLeg(leg)}>
                    Remove
                  </Button>
                </span>
              </div>
              <div className="hm-item__meta">
                <span>{leg.when ?? "NO TIME STATED"}</span>
                <span>{leg.stops === 0 ? "NO STOPS" : `${leg.stops} STOP${leg.stops === 1 ? "" : "S"}`}</span>
              </div>
              {leg.note ? <p className="hm-item__body">{leg.note}</p> : null}
              {leg.status === "held" ? (
                <p className="hm-item__body">
                  <b>Why:</b> {leg.holdReason}
                  <br />
                  <b>Now:</b> {leg.holdNewPlan}
                  <br />
                  <b>Unchanged:</b> {leg.holdUnchanged}
                </p>
              ) : null}
            </div>
          ))
        )}
      </section>

      {/* — stops — */}
      <section className="hm-sec">
        <div className="hm-head">
          <h2>The port guide.</h2>
          <span className="hm-acts">
            <Button
              variant="gold"
              size="sm"
              onClick={() => setStopForm({ id: null, f: { ...BLANK_STOP, position: String(nextPosition) } })}
            >
              Add a stop
            </Button>
          </span>
        </div>
        <p className="hm-note">
          Tender out, last tender back, and what is worth knowing ashore. A leg
          can have no stops; a stop can stand on its own. Times are the
          port&apos;s own — plain clock, no zone.
        </p>

        {stops.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Anchor"
            title="No port guide."
            detail="With no stops the guide card is omitted from the charter page without a word — a member sees nothing and has no way to know anything is missing."
          />
        ) : (
          stops.map((stop) => (
            <div className="hm-item" key={stop.id}>
              <div className="hm-item__head">
                <b>
                  {stop.position}. {stop.name}
                </b>
                <span className="hm-item__acts">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      setStopForm({
                        id: stop.id,
                        f: {
                          position: String(stop.position),
                          name: stop.name,
                          legId: stop.legId ?? "",
                          tenderAt: stop.tenderAt,
                          lastReturn: stop.lastReturn,
                          notes: stop.notes ?? "",
                        },
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => removeStop(stop.id), "Stop removed from the guide.")}
                  >
                    Remove
                  </Button>
                </span>
              </div>
              <div className="hm-item__meta">
                <span>{stop.tenderAt ? `TENDER ${stop.tenderAt}` : "NO TENDER TIME"}</span>
                <span>{stop.lastReturn ? `LAST BACK ${stop.lastReturn}` : "NO LAST RETURN"}</span>
                <span>
                  {stop.legId
                    ? (legs.find((l) => l.id === stop.legId)?.port ?? "UNDER A LEG").toUpperCase()
                    : "UNFILED"}
                </span>
              </div>
              {stop.notes ? <p className="hm-item__body">{stop.notes}</p> : null}
            </div>
          ))
        )}
      </section>

      {/* — leg form — */}
      <Dialog
        open={!!legForm}
        onClose={() => setLegForm(null)}
        width={560}
        eyebrow="Itinerary"
        title={legForm?.id ? "Edit the leg" : "Add a leg"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLegForm(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                legForm &&
                run(
                  () =>
                    saveLeg(voyageId, legForm.id, {
                      day: Number(legForm.f.day),
                      port: legForm.f.port,
                      note: legForm.f.note,
                      startsAt: legForm.f.startsAt,
                    }),
                  legForm.id ? "Leg saved." : "Leg posted.",
                  () => setLegForm(null)
                )
              }
            >
              {legForm?.id ? "Save the leg" : "Post the leg"}
            </Button>
          </>
        }
      >
        {legForm ? (
          <div className="hm-form">
            <div className="hm-form__row">
              <Input
                label="Day"
                type="number"
                min={1}
                value={legForm.f.day}
                onChange={(e) => setLegForm({ ...legForm, f: { ...legForm.f, day: e.target.value } })}
              />
              <Input
                label="Departs"
                type="datetime-local"
                value={legForm.f.startsAt}
                onChange={(e) => setLegForm({ ...legForm, f: { ...legForm.f, startsAt: e.target.value } })}
                hint="Read on the sailing's own clock, never the browser's."
              />
            </div>
            <Input
              label="Port"
              value={legForm.f.port}
              onChange={(e) => setLegForm({ ...legForm, f: { ...legForm.f, port: e.target.value } })}
            />
            <Textarea
              label="Note"
              rows={3}
              value={legForm.f.note}
              onChange={(e) => setLegForm({ ...legForm, f: { ...legForm.f, note: e.target.value } })}
              hint="What a member reads under the day. Optional."
            />
          </div>
        ) : null}
      </Dialog>

      {/* — stop form — */}
      <Dialog
        open={!!stopForm}
        onClose={() => setStopForm(null)}
        width={560}
        eyebrow="Port guide"
        title={stopForm?.id ? "Edit the stop" : "Add a stop"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStopForm(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                stopForm &&
                run(
                  () =>
                    saveStop(voyageId, stopForm.id, {
                      position: Number(stopForm.f.position),
                      name: stopForm.f.name,
                      legId: stopForm.f.legId || null,
                      tenderAt: stopForm.f.tenderAt,
                      lastReturn: stopForm.f.lastReturn,
                      notes: stopForm.f.notes,
                    }),
                  stopForm.id ? "Stop saved." : "Stop added to the guide.",
                  () => setStopForm(null)
                )
              }
            >
              {stopForm?.id ? "Save the stop" : "Add the stop"}
            </Button>
          </>
        }
      >
        {stopForm ? (
          <div className="hm-form">
            <div className="hm-form__row">
              <Input
                label="Position"
                type="number"
                min={1}
                value={stopForm.f.position}
                onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, position: e.target.value } })}
              />
              <Select
                label="Under which leg"
                options={legOptions}
                value={stopForm.f.legId}
                onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, legId: e.target.value } })}
              />
            </div>
            <Input
              label="Stop"
              value={stopForm.f.name}
              onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, name: e.target.value } })}
            />
            <div className="hm-form__row">
              <Input
                label="Tender out"
                type="time"
                value={stopForm.f.tenderAt}
                onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, tenderAt: e.target.value } })}
              />
              <Input
                label="Last tender back"
                type="time"
                value={stopForm.f.lastReturn}
                onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, lastReturn: e.target.value } })}
              />
            </div>
            <Textarea
              label="Notes"
              rows={3}
              value={stopForm.f.notes}
              onChange={(e) => setStopForm({ ...stopForm, f: { ...stopForm.f, notes: e.target.value } })}
            />
          </div>
        ) : null}
      </Dialog>

      {/* — the hold — */}
      <Dialog
        open={!!holdFor}
        onClose={() => setHoldFor(null)}
        width={560}
        eyebrow={holdFor ? `Day ${holdFor.day} — ${holdFor.port}` : undefined}
        title="Post a hold"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHoldFor(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={pending || !hold.reason.trim() || !hold.newPlan.trim() || !hold.unchanged.trim()}
              onClick={() =>
                holdFor &&
                run(
                  () => postLegHold(holdFor.id, hold.reason, hold.newPlan, hold.unchanged),
                  "Hold posted. The leg reads held, with all three lines.",
                  () => setHoldFor(null)
                )
              }
            >
              Post the hold
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 12 }}>
          A hold does not cancel a leg — it swaps it. All three lines are
          required, and the database refuses a hold that is missing one, because
          a hold without a new plan is just bad news.
        </p>
        <div className="hm-form">
          <Textarea
            label="Why"
            rows={2}
            value={hold.reason}
            onChange={(e) => setHold({ ...hold, reason: e.target.value })}
          />
          <Textarea
            label="What happens now"
            rows={2}
            value={hold.newPlan}
            onChange={(e) => setHold({ ...hold, newPlan: e.target.value })}
          />
          <Textarea
            label="What is unchanged"
            rows={2}
            value={hold.unchanged}
            onChange={(e) => setHold({ ...hold, unchanged: e.target.value })}
          />
        </div>
      </Dialog>

      {/* — removing a leg — */}
      <Dialog
        open={!!confirmLeg}
        onClose={() => setConfirmLeg(null)}
        eyebrow="Itinerary"
        title="Remove this leg?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLeg(null)}>
              Keep it
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                confirmLeg &&
                run(() => removeLeg(confirmLeg.id), "Leg removed.", () => setConfirmLeg(null))
              }
            >
              Remove it
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
          Day {confirmLeg?.day} — {confirmLeg?.port} comes off the itinerary
          every pass-holder reads.
          {confirmLeg?.stops
            ? ` Its ${confirmLeg.stops} port-guide stop${confirmLeg.stops === 1 ? "" : "s"} go with it.`
            : ""}
        </p>
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
