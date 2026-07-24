"use client";

import React from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Input,
  Progress,
  Select,
  Stepper,
  Toast,
} from "@/components/ds";
import { SUB_CLASSES } from "@/lib/brand";
import type { EventClass, MembershipTier, VoyageStatus } from "@/lib/supabase/types";
import { useToast } from "../../ui";
import {
  createVoyage,
  saveVoyageOps,
  setBerthsTotal,
  setHeldPasses,
  setVoyageStatus,
  type ItineraryLeg,
  type SubClass,
} from "./actions";

export type VoyageOpsRow = {
  id: string;
  title: string;
  cls: string;
  subClass: string | null;
  kind: string;
  departs: string;
  startsAtIso: string;
  vessels: number;
  aboard: number;
  berths: number;
  held: number;
  price: string;
  status: VoyageStatus;
  muster: string;
  wind: string;
  swell: string;
  heading: string;
  speed: string;
};

/* The 3rd-yacht rule as product logic — a flotilla forms at 30 berths. */
const FLOTILLA_FORMS_AT = 30;

function insideT72(row: VoyageOpsRow): boolean {
  const ms = new Date(row.startsAtIso).getTime() - Date.now();
  return ms > 0 && ms <= 72 * 3600 * 1000;
}

function FlotillaMeter({ row }: { row: VoyageOpsRow }) {
  if (row.cls !== "sea" || row.vessels === 0) return null;
  const short = row.aboard < FLOTILLA_FORMS_AT;
  const holding =
    short &&
    insideT72(row) &&
    (row.status === "scheduled" || row.status === "live" || row.status === "weather_hold");
  return (
    <div style={{ marginTop: 12, maxWidth: 460 }}>
      <Progress
        value={(row.aboard / FLOTILLA_FORMS_AT) * 100}
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            FLOTILLA FORMS AT {FLOTILLA_FORMS_AT} — profitable at 3 yachts
            {holding ? <Badge tone="clay">Under 30 inside T-72h</Badge> : null}
          </span>
        }
        detail={`${row.aboard} / ${FLOTILLA_FORMS_AT} · ${row.vessels} ${row.vessels === 1 ? "YACHT" : "YACHTS"}`}
      />
    </div>
  );
}

const STATUS_TONE: Record<VoyageStatus, "brass" | "ink" | "laurel" | "clay" | "outline"> = {
  scheduled: "outline",
  live: "brass",
  weather_hold: "clay",
  completed: "laurel",
  cancelled: "ink",
};

const STATUS_LABEL: Record<VoyageStatus, string> = {
  scheduled: "Scheduled",
  live: "Live",
  weather_hold: "Weather hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

type StatusMove = {
  to: VoyageStatus;
  label: string;
  title: string;
  body: string;
  confirm: string;
  tone: "laurel" | "clay" | "ink";
};

function movesFor(status: VoyageStatus): StatusMove[] {
  const hold: StatusMove = {
    to: "weather_hold",
    label: "Call weather hold",
    title: "Call the weather hold?",
    body: "Every pass gets the word by email and the Word tab. We call it by 18:00 the night before.",
    confirm: "Call the hold",
    tone: "clay",
  };
  const lift: StatusMove = {
    to: "scheduled",
    label: "Lift hold",
    title: "Lift the hold?",
    body: "Status returns to scheduled and the manifest reopens. Passes keep their order.",
    confirm: "Lift the hold",
    tone: "ink",
  };
  const complete: StatusMove = {
    to: "completed",
    label: "Mark completed",
    title: "Mark completed?",
    body: "Completion banks knots — 10 per NM, 40 per Port Day. The ledger writes once.",
    confirm: "Mark completed",
    tone: "laurel",
  };
  const cancel: StatusMove = {
    to: "cancelled",
    label: "Cancel",
    title: "Cancel the voyage?",
    body: "Cancelling credits every account in full and sends the word — the trigger does it, no forms.",
    confirm: "Cancel the voyage",
    tone: "clay",
  };
  if (status === "scheduled") return [hold, complete, cancel];
  if (status === "live") return [hold, complete, cancel];
  if (status === "weather_hold") return [lift, complete, cancel];
  return [];
}

export function VoyagesClient({
  rows,
  harbors,
}: {
  rows: VoyageOpsRow[];
  harbors: Array<{ value: string; label: string }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [move, setMove] = React.useState<{ row: VoyageOpsRow; m: StatusMove } | null>(null);
  const [ops, setOps] = React.useState<VoyageOpsRow | null>(null);
  const [opsForm, setOpsForm] = React.useState({ wind: "", swell: "", heading: "", speed: "", muster: "" });
  const [creating, setCreating] = React.useState(false);

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "siren" });
      else ok();
    });
  };

  const openOps = (row: VoyageOpsRow) => {
    setOpsForm({ wind: row.wind, swell: row.swell, heading: row.heading, speed: row.speed, muster: row.muster });
    setOps(row);
  };

  return (
    <>
      <div className="hm-head" style={{ marginTop: 20 }}>
        <p className="hm-note" style={{ marginTop: 0 }}>
          Holds, completions, and cancellations fan out to every pass — each one asks first. Held
          passes are off sale — capacity for sale = total − holds.
        </p>
        <Button variant="brass" size="sm" onClick={() => setCreating(true)}>
          New voyage
        </Button>
      </div>

      {rows.map((v) => (
        <div className="hm-voy" key={v.id}>
          <div className="hm-voy__head">
            <b>{v.title}</b>
            <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
          </div>
          <div className="hm-voy__meta">
            <span>{v.departs}</span>
            <span>·</span>
            <span>{v.cls.toUpperCase()}</span>
            {v.subClass ? (
              <>
                <span>·</span>
                <span>{v.subClass.toUpperCase()}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{v.kind.replaceAll("_", " ").toUpperCase()}</span>
            <span>·</span>
            <span>
              {v.aboard} ABOARD / {v.berths} PASSES
            </span>
            <span>·</span>
            <span>
              {v.held} HELD · {Math.max(0, v.berths - v.held)} FOR SALE
            </span>
            <span>·</span>
            <span>{v.price}</span>
            {v.muster ? (
              <>
                <span>·</span>
                <span>MUSTER {v.muster.toUpperCase()}</span>
              </>
            ) : null}
          </div>
          <FlotillaMeter row={v} />
          <div className="hm-voy__ctl">
            <span className="hm-voy__cap">
              <span className="hm-mono">CAPACITY</span>
              <Stepper
                size="sm"
                min={Math.max(0, v.aboard)}
                max={96}
                value={v.berths}
                onChange={(n) =>
                  run(
                    () => setBerthsTotal(v.id, n),
                    () => show({ msg: "Capacity set.", meta: `${v.title.toUpperCase()} · ${n} PASSES` })
                  )
                }
              />
              <span className="hm-mono" title="Held passes are off sale — capacity for sale = total − holds">
                HOLDS
              </span>
              <Stepper
                size="sm"
                min={0}
                max={v.berths}
                value={v.held}
                onChange={(n) =>
                  run(
                    () => setHeldPasses(v.id, n),
                    () =>
                      show({
                        msg: "Holds set.",
                        meta: `${v.title.toUpperCase()} · ${n} HELD · ${Math.max(0, v.berths - n)} FOR SALE`,
                      })
                  )
                }
              />
            </span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => openOps(v)}>
              Conditions
            </Button>
            {movesFor(v.status).map((m) => (
              <Button
                key={m.to + m.label}
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setMove({ row: v, m })}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {rows.length === 0 ? (
        <p style={{ padding: "24px 4px", color: "var(--text-3)", fontSize: 13 }}>
          Nothing on the board. Set the first voyage.
        </p>
      ) : null}

      <Dialog
        open={!!move}
        onClose={() => setMove(null)}
        width={400}
        eyebrow={move ? move.row.title : ""}
        title={move ? move.m.title : ""}
        footer={
          move ? (
            <>
              <Button variant="ghost" onClick={() => setMove(null)}>
                Not yet
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const { row, m } = move;
                  setMove(null);
                  run(
                    () => setVoyageStatus(row.id, m.to),
                    () =>
                      show({
                        msg: `${STATUS_LABEL[m.to]} — ${row.title}.`,
                        meta: m.to === "weather_hold" || m.to === "cancelled" ? "EVERY PASS GETS THE WORD" : "LOGGED",
                        tone: m.tone,
                      })
                  );
                }}
              >
                {move.m.confirm}
              </Button>
            </>
          ) : null
        }
      >
        {move ? move.m.body : ""}
      </Dialog>

      <Dialog
        open={!!ops}
        onClose={() => setOps(null)}
        width={440}
        eyebrow={ops ? ops.title : ""}
        title="Conditions and muster."
        footer={
          ops ? (
            <>
              <Button variant="ghost" onClick={() => setOps(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const row = ops;
                  setOps(null);
                  run(
                    () =>
                      saveVoyageOps(
                        row.id,
                        {
                          wind: opsForm.wind,
                          swell: opsForm.swell,
                          heading: opsForm.heading,
                          speed: opsForm.speed,
                        },
                        opsForm.muster
                      ),
                    () => show({ msg: "Conditions logged.", meta: row.title.toUpperCase() })
                  );
                }}
              >
                Save
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <div className="hm-form__row">
            <Input
              label="Wind"
              placeholder="12 KN SW"
              value={opsForm.wind}
              onChange={(e) => setOpsForm((f) => ({ ...f, wind: e.target.value }))}
            />
            <Input
              label="Swell"
              placeholder="2 FT @ 9 S"
              value={opsForm.swell}
              onChange={(e) => setOpsForm((f) => ({ ...f, swell: e.target.value }))}
            />
          </div>
          <div className="hm-form__row">
            <Input
              label="Heading"
              placeholder="240°"
              value={opsForm.heading}
              onChange={(e) => setOpsForm((f) => ({ ...f, heading: e.target.value }))}
            />
            <Input
              label="Speed"
              placeholder="6.5 KN"
              value={opsForm.speed}
              onChange={(e) => setOpsForm((f) => ({ ...f, speed: e.target.value }))}
            />
          </div>
          <Input
            label="Muster"
            placeholder="05:45 · Gangway B-12"
            value={opsForm.muster}
            onChange={(e) => setOpsForm((f) => ({ ...f, muster: e.target.value }))}
          />
        </div>
      </Dialog>

      <NewVoyageDialog
        open={creating}
        onClose={() => setCreating(false)}
        harbors={harbors}
        pending={pending}
        onCreate={(input, title) =>
          run(
            () => createVoyage(input),
            () => {
              setCreating(false);
              show({ msg: "Voyage on the board.", meta: title.toUpperCase(), tone: "laurel" });
            }
          )
        }
      />

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}

type ItineraryDraft = { offset: string; title: string; note: string };

type NewVoyageForm = {
  title: string;
  slug: string;
  cls: EventClass;
  subClass: string;
  kind: string;
  harborId: string;
  startsAt: string;
  distance: string;
  berths: number;
  price: string;
  minTier: MembershipTier;
  media: string;
  deposit: boolean;
  itinerary: ItineraryDraft[];
};

const BLANK: NewVoyageForm = {
  title: "",
  slug: "",
  cls: "sea",
  subClass: "voyage",
  kind: "sea_day",
  harborId: "",
  startsAt: "",
  distance: "",
  berths: 24,
  price: "",
  minTier: "regional",
  media: "dawn",
  deposit: false,
  itinerary: [],
};

/* One duration ladder for every family — sea days and port days both climb
   voyage, expedition, odyssey. */
function subClassOptions(): Array<{ value: string; label: string }> {
  return Object.entries(SUB_CLASSES).map(([value, s]) => ({
    value,
    label: `${s.label} — ${s.note}`,
  }));
}

function NewVoyageDialog({
  open,
  onClose,
  harbors,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  harbors: Array<{ value: string; label: string }>;
  pending: boolean;
  onCreate: (input: Parameters<typeof createVoyage>[0], title: string) => void;
}) {
  const [f, setF] = React.useState<NewVoyageForm>(BLANK);
  const set = <K extends keyof NewVoyageForm>(k: K, v: NewVoyageForm[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  /* Class picks the sub-class ladder — keep the two in step. */
  const setClass = (cls: EventClass) =>
    setF((prev) => ({ ...prev, cls, subClass: prev.subClass || (subClassOptions()[0]?.value ?? "") }));

  const setLeg = (i: number, patch: Partial<ItineraryDraft>) =>
    setF((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((leg, j) => (j === i ? { ...leg, ...patch } : leg)),
    }));
  const addLeg = () =>
    setF((prev) => ({ ...prev, itinerary: [...prev.itinerary, { offset: "", title: "", note: "" }] }));
  const dropLeg = (i: number) =>
    setF((prev) => ({ ...prev, itinerary: prev.itinerary.filter((_, j) => j !== i) }));

  const submit = () => {
    const itinerary: ItineraryLeg[] = f.itinerary
      .filter((leg) => leg.title.trim())
      .map((leg) => ({
        offset: leg.offset.trim() ? Number(leg.offset) : 0,
        title: leg.title.trim(),
        note: leg.note.trim(),
      }));
    onCreate(
      {
        slug: f.slug || f.title,
        title: f.title,
        cls: f.cls,
        subClass: (f.subClass || null) as SubClass | null,
        kind: f.kind,
        harborId: f.harborId || null,
        startsAt: f.startsAt,
        distanceNm: f.distance.trim() ? Number(f.distance) : null,
        berths: f.berths,
        priceCents: f.price.trim() ? Math.round(Number(f.price) * 100) : 0,
        minTier: f.minTier,
        media: f.media,
        depositRequired: f.deposit,
        itinerary,
      },
      f.title
    );
    setF(BLANK);
  };

  const subOptions = subClassOptions();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={560}
      eyebrow="Voyages"
      title="A new line on the manifest."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button variant="brass" disabled={pending || !f.title || !f.startsAt} onClick={submit}>
            Set the voyage
          </Button>
        </>
      }
    >
      <div className="hm-form">
        <div className="hm-form__row">
          <Input label="Title" placeholder="The Catalina Crossing" value={f.title} onChange={(e) => set("title", e.target.value)} />
          <Input label="Slug" placeholder="catalina-crossing" hint="Blank uses the title." value={f.slug} onChange={(e) => set("slug", e.target.value)} />
        </div>
        <div className="hm-form__row">
          <Select
            label="Class"
            options={[
              { value: "sea", label: "Sea Day" },
              { value: "shore", label: "Port Day" },
            ]}
            value={f.cls}
            onChange={(e) => setClass(e.target.value as EventClass)}
          />
          <Select
            label="Sub-class"
            options={subOptions.length ? subOptions : [{ value: "", label: "None" }]}
            value={f.subClass}
            disabled={subOptions.length === 0}
            onChange={(e) => set("subClass", e.target.value)}
          />
        </div>
        <div className="hm-form__row">
          <Input label="Kind" placeholder="sea_day · port_day" value={f.kind} onChange={(e) => set("kind", e.target.value)} />
        </div>
        <div className="hm-form__row">
          <Select
            label="Harbor"
            options={[{ value: "", label: "Unassigned" }, ...harbors]}
            value={f.harborId}
            onChange={(e) => set("harborId", e.target.value)}
          />
          <Input label="Departs" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </div>
        <div className="hm-form__row">
          <Input label="Distance (NM)" type="number" min={0} placeholder="26" value={f.distance} onChange={(e) => set("distance", e.target.value)} />
          <Input label="Price ($)" type="number" min={0} step="0.01" placeholder="0 = complimentary" value={f.price} onChange={(e) => set("price", e.target.value)} />
        </div>
        <div className="hm-form__row">
          <Select
            label="Minimum tier"
            options={[
              { value: "regional", label: "Regional" },
              { value: "national", label: "National" },
              { value: "global", label: "Global" },
            ]}
            value={f.minTier}
            onChange={(e) => set("minTier", e.target.value as MembershipTier)}
          />
          <Select
            label="Imagery"
            options={[
              { value: "dawn", label: "Dawn" },
              { value: "day", label: "Day" },
              { value: "dusk", label: "Dusk" },
            ]}
            value={f.media}
            onChange={(e) => set("media", e.target.value)}
          />
        </div>
        <div className="hm-form__row" style={{ alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span className="hm-mono">CAPACITY</span>
            <Stepper size="sm" min={1} max={96} value={f.berths} onChange={(n) => set("berths", n)} />
          </span>
          <Checkbox
            label="Deposit required"
            checked={f.deposit}
            onChange={(e) => set("deposit", e.target.checked)}
          />
        </div>

        {/* Itinerary — minutes from cast off, a title, a note. */}
        <div>
          <div className="hm-head">
            <span className="hm-mono">ITINERARY · MINUTES FROM CAST OFF</span>
            <Button variant="ghost" size="sm" onClick={addLeg}>
              Add leg
            </Button>
          </div>
          {f.itinerary.map((leg, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 1fr auto",
                gap: 8,
                alignItems: "end",
                marginTop: 8,
              }}
            >
              <Input
                label={i === 0 ? "Offset" : undefined}
                type="number"
                placeholder="-30"
                value={leg.offset}
                onChange={(e) => setLeg(i, { offset: e.target.value })}
              />
              <Input
                label={i === 0 ? "Title" : undefined}
                placeholder="Muster"
                value={leg.title}
                onChange={(e) => setLeg(i, { title: e.target.value })}
              />
              <Input
                label={i === 0 ? "Note" : undefined}
                placeholder="Gangway B-12. Coffee on the dock."
                value={leg.note}
                onChange={(e) => setLeg(i, { note: e.target.value })}
              />
              <Button variant="ghost" size="sm" onClick={() => dropLeg(i)} aria-label={`Remove leg ${i + 1}`}>
                Remove
              </Button>
            </div>
          ))}
          {f.itinerary.length === 0 ? (
            <p className="hm-note">No legs yet. The itinerary prints on the manifest and the stub.</p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
