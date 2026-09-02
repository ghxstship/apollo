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
import {
  EXPERIENCE_CLASSES,
  EXPERIENCE_CLASS_IDS,
  SETTING_LABEL,
  SUB_CLASSES,
  type ExperienceClassId,
} from "@/lib/brand";
import type { EventClass, MembershipTier, VoyageStatus } from "@/lib/supabase/types";
import { useToast } from "../../ui";
import {
  assignVessel,
  createVoyage,
  removeVessel,
  saveVoyageOps,
  saveVoyageProgram,
  setBerthsTotal,
  setHeldPasses,
  setVoyageStatus,
  type ItineraryLeg,
  type SubClass,
} from "./actions";

export type AssignedHull = {
  vesselId: string;
  name: string;
  capacity: number;
  position: number;
};

export type FleetVessel = { id: string; name: string; capacity: number };

export type VoyageOpsRow = {
  id: string;
  title: string;
  cls: string;
  subClass: string | null;
  /* open | club | premium | exotic — the second axis. */
  experienceClass: string;
  kind: string;
  departs: string;
  startsAtIso: string;
  /* The departure on the harbor's wall clock, as a datetime-local value — the
     same frame the on-sale input is typed in, so the two compare as strings. */
  startsAtLocal: string;
  vessels: number;
  hulls: AssignedHull[];
  aboard: number;
  berths: number;
  held: number;
  price: string;
  priceCents: number;
  status: VoyageStatus;
  /* Where this sailing stands in a series: the template a series clones
     forward, an occurrence raised from one, or neither. */
  series: { role: "template" | "occurrence"; title: string; occurrences: number } | null;
  muster: string;
  wind: string;
  swell: string;
  heading: string;
  speed: string;
  /* — the program: filing, season, venue, sale window, deposit — */
  format: string | null;
  /* The catalogue's name for that filing — what the board leads with, because
     it is what a member reads on the card. Null when the sailing is unfiled. */
  formatLabel: string | null;
  seasonId: string | null;
  venueId: string | null;
  /* Wall clock on the harbor, as a datetime-local value; "" = on sale now. */
  saleOpensAtLocal: string;
  presaleHours: number;
  depositCents: number;
};

/* A retired season, venue or format stays in the picker, marked, so a voyage
   that holds one reads as what it is rather than as Unassigned. The composer
   offers only the live ones for a new filing. */
export type ProgramOption = { value: string; label: string; retired?: boolean };

export type FormatOption = ProgramOption & {
  category: string;
  /* What this format files a sailing as. Naming the format hands the column
     over to the trigger, so the composer shows this instead of pretending the
     operator's own pick still counts. */
  experienceClass: string;
  access: string;
  /* "open · $350 · seats 40", "by invitation", "on request", "included" */
  accessLine: string;
  priceCents: number | null;
  capacity: number | null;
};

/* sky was folded into shore when the setting axis landed; the enum still
   carries it, so it takes the ashore default. */
const DEFAULT_KIND: Record<EventClass, string> = { sea: "sea_day", shore: "port_day", sky: "port_day" };

/* A format's category settles the setting: port → ashore, sea → afloat. The
   category column now holds only those two — how far the club goes moved to
   experience_class — so anything else leaves the setting as the operator set
   it rather than guessing. */
function classForCategory(category: string, current: EventClass): EventClass {
  if (category === "port") return "shore";
  if (category === "sea") return "sea";
  return current;
}

/* What a_sailing_honours_its_format will refuse, said here before the submit
   rather than by the trigger after it. Each names the way out. */
function formatConflicts(format: FormatOption | undefined, berths: number, priceCents: number): string[] {
  if (!format) return [];
  const out: string[] = [];
  if (format.access === "included" && priceCents > 0) {
    out.push(
      `${format.label} is included with a pass and never sold alone — the board will refuse a price. Clear the price, or file it under another format.`
    );
  }
  if (format.capacity !== null && berths > format.capacity) {
    out.push(
      `A ${format.label} seats ${format.capacity} — the board will refuse ${berths} berths. Lower the capacity, or file it under another format.`
    );
  }
  return out;
}

const DEPOSIT_CEILING = 1000;
const ERR_DEPOSIT_CEILING = "A deposit is at most $1,000.";
const ERR_DROP_AFTER_DEPARTURE = "The drop has to open before the boat leaves.";

/* Both values are wall clocks on the same harbor, in datetime-local form, so
   the string order is the time order. */
function dropAfterDeparture(saleOpensAt: string, startsAt: string): boolean {
  return !!saleOpensAt && !!startsAt && saleOpensAt > startsAt;
}

function formatOptions(formats: FormatOption[], blank: string): ProgramOption[] {
  return [{ value: "", label: blank }, ...formats.map((f) => ({ value: f.value, label: `${f.label} · ${f.accessLine}` }))];
}

/* The four rungs of the second axis, in ladder order. */
const EXPERIENCE_OPTIONS = EXPERIENCE_CLASS_IDS.map((id) => ({
  value: id,
  label: `${EXPERIENCE_CLASSES[id].label} — ${EXPERIENCE_CLASSES[id].what}`,
}));

/* Said the same way in both dialogs: the class is the operator's to set only
   while the sailing is unfiled. a_sailing_keeps_its_taxonomy copies it off the
   format on every write that names one, so a control that looked live under a
   chosen format would be promising an edit the board will undo. */
function experienceClassHint(format: FormatOption | undefined): string {
  if (!format) return "Yours to set while this sailing is unfiled.";
  const files = EXPERIENCE_CLASSES[format.experienceClass as ExperienceClassId];
  return files
    ? `Follows the format — ${format.label} files as ${files.label}.`
    : "Follows the format.";
}

/* What a sailing is, in the words a member reads it in: its format's name, or
   where it happens when it has no format, then how long it runs. The class and
   the ladder key used to print here instead, which named the filing system
   rather than the thing. */
function identityLine(row: {
  formatLabel: string | null;
  cls: string;
  subClass: string | null;
  experienceClass: string;
}): string[] {
  const hours = row.subClass ? SUB_CLASSES[row.subClass]?.label : null;
  const experience = EXPERIENCE_CLASSES[row.experienceClass as ExperienceClassId]?.label;
  return [
    row.formatLabel ?? SETTING_LABEL[row.cls] ?? row.cls,
    ...(hours ? [hours] : []),
    ...(experience ? [experience] : []),
  ];
}

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
            {holding ? <Badge tone="caution">Under 30 inside T-72h</Badge> : null}
          </span>
        }
        detail={`${row.aboard} / ${FLOTILLA_FORMS_AT} · ${row.vessels} ${row.vessels === 1 ? "YACHT" : "YACHTS"}`}
      />
    </div>
  );
}

const STATUS_TONE: Record<VoyageStatus, "gold" | "ink" | "positive" | "caution" | "outline"> = {
  scheduled: "outline",
  live: "gold",
  weather_hold: "caution",
  completed: "positive",
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
  tone: "positive" | "caution" | "ink";
};

function movesFor(status: VoyageStatus): StatusMove[] {
  const hold: StatusMove = {
    to: "weather_hold",
    label: "Call weather hold",
    title: "Call the weather hold?",
    body: "Every pass gets the word by email and the Word tab. We call it by 18:00 the night before.",
    confirm: "Call the hold",
    tone: "caution",
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
    body: "Completion banks knots — 10 per NM afloat, 40 for a day ashore. The ledger writes once.",
    confirm: "Mark completed",
    tone: "positive",
  };
  const cancel: StatusMove = {
    to: "cancelled",
    label: "Cancel",
    title: "Cancel the voyage?",
    body: "Cancelling credits every account in full and sends the word — the trigger does it, no forms.",
    confirm: "Cancel the voyage",
    tone: "caution",
  };
  if (status === "scheduled") return [hold, complete, cancel];
  if (status === "live") return [hold, complete, cancel];
  if (status === "weather_hold") return [lift, complete, cancel];
  return [];
}

type ProgramForm = {
  format: string;
  experienceClass: ExperienceClassId;
  seasonId: string;
  venueId: string;
  saleOpensAt: string;
  presaleHours: string;
  deposit: string;
};

export function VoyagesClient({
  rows,
  harbors,
  seasons,
  venues,
  formats,
  fleet,
}: {
  rows: VoyageOpsRow[];
  harbors: Array<{ value: string; label: string }>;
  seasons: ProgramOption[];
  venues: ProgramOption[];
  formats: FormatOption[];
  fleet: FleetVessel[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [move, setMove] = React.useState<{ row: VoyageOpsRow; m: StatusMove } | null>(null);
  const [ops, setOps] = React.useState<VoyageOpsRow | null>(null);
  const [opsForm, setOpsForm] = React.useState({ wind: "", swell: "", heading: "", speed: "", muster: "" });
  const [program, setProgram] = React.useState<VoyageOpsRow | null>(null);
  const [programForm, setProgramForm] = React.useState<ProgramForm>({
    format: "",
    experienceClass: "club",
    seasonId: "",
    venueId: "",
    saleOpensAt: "",
    presaleHours: "24",
    deposit: "50",
  });
  const [creating, setCreating] = React.useState(false);
  /* The flotilla dialog holds the voyage's ID, not the row: the rows prop is
     refreshed by revalidatePath after every assign/remove, and a captured row
     object would keep showing the flotilla as it stood when the dialog opened. */
  const [flotillaId, setFlotillaId] = React.useState<string | null>(null);
  const flotilla = flotillaId ? (rows.find((r) => r.id === flotillaId) ?? null) : null;

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const openOps = (row: VoyageOpsRow) => {
    setOpsForm({ wind: row.wind, swell: row.swell, heading: row.heading, speed: row.speed, muster: row.muster });
    setOps(row);
  };

  const openProgram = (row: VoyageOpsRow) => {
    setProgramForm({
      format: row.format ?? "",
      experienceClass: (EXPERIENCE_CLASS_IDS as readonly string[]).includes(row.experienceClass)
        ? (row.experienceClass as ExperienceClassId)
        : "club",
      seasonId: row.seasonId ?? "",
      venueId: row.venueId ?? "",
      saleOpensAt: row.saleOpensAtLocal,
      presaleHours: String(row.presaleHours),
      deposit: String(row.depositCents / 100),
    });
    setProgram(row);
  };

  /* The Program dialog's own refusals, worked out before the save so the
     button says why rather than the toast afterwards. The format ones are the
     trigger's; the deposit and drop ones are the CHECKs'. */
  const programFormat = formats.find((f) => f.value === programForm.format);
  const formatRefusals = program ? formatConflicts(programFormat, program.berths, program.priceCents) : [];
  const programRefusals = [
    ...formatRefusals,
    ...(Number(programForm.deposit || "0") > DEPOSIT_CEILING ? [ERR_DEPOSIT_CEILING] : []),
    ...(program && dropAfterDeparture(programForm.saleOpensAt, program.startsAtLocal) ? [ERR_DROP_AFTER_DEPARTURE] : []),
  ];

  return (
    <>
      <div className="hm-head" style={{ marginTop: 20 }}>
        <p className="hm-note" style={{ marginTop: 0 }}>
          Holds, completions, and cancellations fan out to every pass — each one asks first. Held
          passes are off sale — capacity for sale = total − holds.
        </p>
        <Button variant="gold" size="sm" onClick={() => setCreating(true)}>
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
            {/* Format name and hours, the pairing a member sees — never the
                class-and-ladder codes, and never `kind`, which is plumbing that
                spells out a retired phrase when it is uppercased. */}
            {identityLine(v).map((part) => (
              <React.Fragment key={part}>
                <span>·</span>
                <span>{part.toUpperCase()}</span>
              </React.Fragment>
            ))}
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
            {v.series ? (
              <>
                <span>·</span>
                <span title={v.series.role === "template" ? "The sailing a series clones forward" : "Raised from a series template"}>
                  {v.series.role === "template" ? "SERIES TEMPLATE" : "SERIES OCCURRENCE"} · {v.series.title.toUpperCase()}
                </span>
              </>
            ) : null}
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
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => openProgram(v)}>
              Program
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setFlotillaId(v.id)}>
              Flotilla
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

      {/* — The program: file an existing sailing under a format, season and
          venue, and set its sale window and deposit. The columns landed after
          most sailings did; this is how the board catches up. — */}
      <Dialog
        open={!!program}
        onClose={() => setProgram(null)}
        width={460}
        eyebrow={program ? program.title : ""}
        title="The program."
        footer={
          program ? (
            <>
              <Button variant="ghost" onClick={() => setProgram(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                disabled={pending || programRefusals.length > 0}
                onClick={() => {
                  const row = program;
                  setProgram(null);
                  run(
                    () =>
                      saveVoyageProgram(row.id, {
                        format: programForm.format || null,
                        experienceClass: programForm.experienceClass,
                        seasonId: programForm.seasonId || null,
                        venueId: programForm.venueId || null,
                        saleOpensAt: programForm.saleOpensAt || null,
                        presaleHours: Number(programForm.presaleHours) || 0,
                        depositCents: Math.round(Number(programForm.deposit || "0") * 100),
                      }),
                    () => show({ msg: "Program set.", meta: row.title.toUpperCase() })
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
          {program?.series?.role === "template" ? (
            <p className="hm-note" style={{ marginTop: 0 }}>
              {program.series.occurrences === 1
                ? "1 occurrence will not follow this change"
                : `${program.series.occurrences} occurrences will not follow this change`}{" "}
              — a series copies its template forward when it is extended, not when the template is edited.
            </p>
          ) : null}
          <div className="hm-form__row">
            <Select
              label="Format"
              options={formatOptions(formats, "Unfiled")}
              value={programForm.format}
              hint={programFormat ? programFormat.accessLine : undefined}
              error={formatRefusals.length ? formatRefusals.join(" ") : undefined}
              onChange={(e) => setProgramForm((f) => ({ ...f, format: e.target.value }))}
            />
            {/* Next to the format, because the format is what decides it the
                moment one is named. */}
            <Select
              label="Experience class"
              options={EXPERIENCE_OPTIONS}
              value={programForm.experienceClass}
              hint={experienceClassHint(programFormat)}
              disabled={Boolean(programFormat)}
              onChange={(e) =>
                setProgramForm((f) => ({ ...f, experienceClass: e.target.value as ExperienceClassId }))
              }
            />
          </div>
          <div className="hm-form__row">
            <Select
              label="Season"
              options={[{ value: "", label: "Unassigned" }, ...seasons]}
              value={programForm.seasonId}
              onChange={(e) => setProgramForm((f) => ({ ...f, seasonId: e.target.value }))}
            />
            <Select
              label="Venue"
              options={[{ value: "", label: "Unassigned" }, ...venues]}
              value={programForm.venueId}
              onChange={(e) => setProgramForm((f) => ({ ...f, venueId: e.target.value }))}
            />
          </div>
          <div className="hm-form__row">
            <Input
              label="Deposit ($)"
              type="number"
              min={0}
              max={DEPOSIT_CEILING}
              step="0.01"
              error={Number(programForm.deposit || "0") > DEPOSIT_CEILING ? ERR_DEPOSIT_CEILING : undefined}
              value={programForm.deposit}
              onChange={(e) => setProgramForm((f) => ({ ...f, deposit: e.target.value }))}
            />
          </div>
          <div className="hm-form__row">
            <Input
              label="On sale"
              type="datetime-local"
              hint="On the harbor's clock. Blank means on sale now."
              error={
                program && dropAfterDeparture(programForm.saleOpensAt, program.startsAtLocal)
                  ? ERR_DROP_AFTER_DEPARTURE
                  : undefined
              }
              value={programForm.saleOpensAt}
              onChange={(e) => setProgramForm((f) => ({ ...f, saleOpensAt: e.target.value }))}
            />
            <Input
              label="Presale hours"
              type="number"
              min={0}
              max={336}
              hint="Each deeper tier enters this many hours earlier."
              value={programForm.presaleHours}
              onChange={(e) => setProgramForm((f) => ({ ...f, presaleHours: e.target.value }))}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!flotilla}
        onClose={() => setFlotillaId(null)}
        width={460}
        eyebrow={flotilla ? flotilla.title : ""}
        title="The flotilla."
        footer={
          <Button variant="ghost" onClick={() => setFlotillaId(null)}>
            Close
          </Button>
        }
      >
        {flotilla ? (
          /* Keyed on the voyage so pick, position and the remove confirmation
             reset when the dialog moves to another sailing. */
          <FlotillaBody key={flotilla.id} row={flotilla} fleet={fleet} pending={pending} onRun={run} notify={show} />
        ) : null}
      </Dialog>

      <NewVoyageDialog
        open={creating}
        onClose={() => setCreating(false)}
        harbors={harbors}
        seasons={seasons}
        venues={venues}
        formats={formats}
        pending={pending}
        onCreate={(input, title) =>
          run(
            () => createVoyage(input),
            () => {
              setCreating(false);
              show({ msg: "Voyage on the board.", meta: title.toUpperCase(), tone: "positive" });
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

/* Hull assignment, through the "staff write flotilla" policy that has been on
   voyage_vessels since the fleet landed and never had a writer. Assigning is
   plain; removing asks first, because the manifests screen spreads passes onto
   these hulls and a hull that vanishes under a spread manifest is an
   operational surprise. */
function FlotillaBody({
  row,
  fleet,
  pending,
  onRun,
  notify,
}: {
  row: VoyageOpsRow;
  fleet: FleetVessel[];
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>, ok: () => void) => void;
  notify: (t: { msg: string; meta?: string; tone?: "ink" | "positive" | "caution" | "danger" }) => void;
}) {
  const assigned = new Set(row.hulls.map((h) => h.vesselId));
  const open = fleet.filter((v) => !assigned.has(v.id));
  const [pick, setPick] = React.useState("");
  const [pos, setPos] = React.useState(row.hulls.length + 1);
  /* Confirm-first, inline — a second dialog stacked over this one would fight
     the overlay. The first press arms the row; the second removes. */
  const [arming, setArming] = React.useState<string | null>(null);

  const assign = () => {
    const hull = open.find((v) => v.id === pick);
    if (!hull) return;
    onRun(
      () => assignVessel(row.id, hull.id, pos),
      () => {
        setPick("");
        setPos((p) => p + 1);
        notify({ msg: "Hull assigned.", meta: `${row.title.toUpperCase()} · ${hull.name.toUpperCase()}`, tone: "positive" });
      }
    );
  };

  const remove = (hull: AssignedHull) => {
    setArming(null);
    onRun(
      () => removeVessel(row.id, hull.vesselId),
      () => notify({ msg: "Hull removed.", meta: `${row.title.toUpperCase()} · ${hull.name.toUpperCase()}`, tone: "caution" })
    );
  };

  return (
    <div className="hm-form">
      {row.hulls.length ? (
        <div>
          <span className="hm-mono">ASSIGNED · IN POSITION ORDER</span>
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 13 }}>
            {row.hulls.map((h) => (
              <li key={h.vesselId} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <span className="hm-mono" style={{ minWidth: 24 }}>
                  {h.position}
                </span>
                <span style={{ flex: 1 }}>
                  {h.name}
                  <span style={{ color: "var(--text-3)" }}> · {h.capacity} berths</span>
                </span>
                {arming === h.vesselId ? (
                  <>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArming(null)}>
                      Keep it
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => remove(h)}>
                      Take it off
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArming(h.vesselId)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {arming ? (
            <p className="hm-note" style={{ marginTop: 6 }}>
              Passes already spread onto this hull keep their berth note — spread
              the manifest again after taking it off.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="hm-note" style={{ marginTop: 0 }}>
          No hulls assigned yet. The manifest cannot spread across a flotilla
          that has no yachts in it.
        </p>
      )}

      {open.length ? (
        <div className="hm-form__row" style={{ alignItems: "end" }}>
          <Select
            label="Hull"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={[
              { value: "", label: "Pick a hull" },
              ...open.map((v) => ({ value: v.id, label: `${v.name} · ${v.capacity} berths` })),
            ]}
          />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, paddingBottom: 2 }}>
            <span className="hm-mono">POSITION</span>
            <Stepper size="sm" min={1} max={96} value={pos} onChange={setPos} />
          </span>
          <Button variant="outline" size="sm" disabled={pending || !pick} onClick={assign}>
            Assign
          </Button>
        </div>
      ) : (
        <p className="hm-note">Every active hull in the fleet is already on this voyage.</p>
      )}
    </div>
  );
}

type ItineraryDraft = { offset: string; title: string; note: string };

type NewVoyageForm = {
  title: string;
  slug: string;
  cls: EventClass;
  subClass: string;
  experienceClass: ExperienceClassId;
  kind: string;
  harborId: string;
  startsAt: string;
  endsAt: string;
  distance: string;
  berths: number;
  price: string;
  minTier: MembershipTier;
  media: string;
  deposit: boolean;
  depositAmount: string;
  format: string;
  saleOpensAt: string;
  presaleHours: string;
  seasonId: string;
  venueId: string;
  itinerary: ItineraryDraft[];
};

const BLANK: NewVoyageForm = {
  title: "",
  slug: "",
  cls: "sea",
  subClass: "voyage",
  /* The members' standard is the honest default — most of what the club raises
     is a club sailing, and the operator says so when it is not. */
  experienceClass: "club",
  kind: "sea_day",
  harborId: "",
  startsAt: "",
  endsAt: "",
  distance: "",
  berths: 24,
  price: "",
  minTier: "regional",
  media: "dawn",
  deposit: false,
  depositAmount: "50",
  format: "",
  saleOpensAt: "",
  presaleHours: "24",
  seasonId: "",
  venueId: "",
  itinerary: [],
};

/* One duration ladder whichever setting a sailing runs in — afloat and ashore
   both climb the same three rungs. The labels are hour phrases now, and the
   note is the same range said again ("Up to 4 hours — Under 4 hours"), so the
   phrase stands alone and the range rides along as the picker's hint. */
function subClassOptions(): Array<{ value: string; label: string }> {
  return Object.entries(SUB_CLASSES).map(([value, s]) => ({ value, label: s.label }));
}

function NewVoyageDialog({
  open,
  onClose,
  harbors,
  seasons,
  venues,
  formats,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  harbors: Array<{ value: string; label: string }>;
  seasons: ProgramOption[];
  venues: ProgramOption[];
  formats: FormatOption[];
  pending: boolean;
  onCreate: (input: Parameters<typeof createVoyage>[0], title: string) => void;
}) {
  const [f, setF] = React.useState<NewVoyageForm>(BLANK);
  const set = <K extends keyof NewVoyageForm>(k: K, v: NewVoyageForm[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  /* A new filing goes under a live season, venue or format — the retired ones
     are in the lists only so existing voyages can still show theirs. */
  const liveSeasons = seasons.filter((s) => !s.retired);
  const liveVenues = venues.filter((v) => !v.retired);
  const liveFormats = formats.filter((x) => !x.retired);

  /* The setting picks the duration ladder — keep the two in step. The kind
     follows the setting while it is still the other setting's default, and is
     left alone once the operator has typed their own. */
  const withClass = (prev: NewVoyageForm, cls: EventClass): NewVoyageForm => {
    const wasDefault = !prev.kind.trim() || Object.values(DEFAULT_KIND).includes(prev.kind.trim());
    return {
      ...prev,
      cls,
      kind: wasDefault ? DEFAULT_KIND[cls] : prev.kind,
      subClass: prev.subClass || (subClassOptions()[0]?.value ?? ""),
    };
  };
  const setClass = (cls: EventClass) => setF((prev) => withClass(prev, cls));

  /* Choosing a format settles the setting from its category — a port format
     runs ashore, a sea format afloat. It settles the experience class too, at
     the board, which is why that control goes quiet once one is named. */
  const setFormat = (slug: string) =>
    setF((prev) => {
      const chosen = liveFormats.find((x) => x.value === slug);
      const next = { ...prev, format: slug };
      if (!chosen) return next;
      const cls = classForCategory(chosen.category, prev.cls);
      return cls === prev.cls ? next : withClass(next, cls);
    });

  const chosenFormat = liveFormats.find((x) => x.value === f.format);
  const priceCents = f.price.trim() ? Math.round(Number(f.price) * 100) : 0;
  const formatRefusals = formatConflicts(chosenFormat, f.berths, priceCents);
  const depositOver = f.deposit && Number(f.depositAmount || "0") > DEPOSIT_CEILING;
  const dropLate = dropAfterDeparture(f.saleOpensAt, f.startsAt);
  const refused = formatRefusals.length > 0 || depositOver || dropLate;

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
        experienceClass: f.experienceClass,
        kind: f.kind,
        harborId: f.harborId || null,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        distanceNm: f.distance.trim() ? Number(f.distance) : null,
        berths: f.berths,
        priceCents: f.price.trim() ? Math.round(Number(f.price) * 100) : 0,
        minTier: f.minTier,
        media: f.media,
        depositRequired: f.deposit,
        depositCents: f.depositAmount.trim() ? Math.round(Number(f.depositAmount) * 100) : 5000,
        format: f.format || null,
        saleOpensAt: f.saleOpensAt || null,
        presaleHours: Number(f.presaleHours) || 0,
        seasonId: f.seasonId || null,
        venueId: f.venueId || null,
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
          <Button variant="gold" disabled={pending || !f.title || !f.startsAt || !f.endsAt || refused} onClick={submit}>
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
        {/* Where it happens, and how long it runs. What kind of thing it is —
            the other taxonomy axis — sits with the format below, because the
            format is what settles it. */}
        <div className="hm-form__row">
          <Select
            label="Setting"
            options={[
              { value: "sea", label: SETTING_LABEL.sea },
              { value: "shore", label: SETTING_LABEL.shore },
            ]}
            hint="Where it happens. Only ashore admits an unvetted guest."
            value={f.cls}
            onChange={(e) => setClass(e.target.value as EventClass)}
          />
          <Select
            label="Duration"
            options={subOptions.length ? subOptions : [{ value: "", label: "None" }]}
            value={f.subClass}
            hint={f.subClass ? SUB_CLASSES[f.subClass]?.note : undefined}
            disabled={subOptions.length === 0}
            onChange={(e) => set("subClass", e.target.value)}
          />
        </div>
        <div className="hm-form__row">
          <Select
            label="Format"
            options={formatOptions(liveFormats, "Unfiled")}
            value={f.format}
            hint={chosenFormat ? `${chosenFormat.accessLine} · sets the setting from its category` : "Sets the setting from its category."}
            error={formatRefusals.length ? formatRefusals.join(" ") : undefined}
            onChange={(e) => setFormat(e.target.value)}
          />
          {/* The other axis. Live only for an unfiled sailing — naming a format
              hands the column to the taxonomy trigger, and the hint says so
              rather than letting the control look like it still decides. */}
          <Select
            label="Experience class"
            options={EXPERIENCE_OPTIONS}
            value={f.experienceClass}
            hint={experienceClassHint(chosenFormat)}
            disabled={Boolean(chosenFormat)}
            onChange={(e) => set("experienceClass", e.target.value as ExperienceClassId)}
          />
        </div>
        <div className="hm-form__row">
          <Input
            label="Kind"
            placeholder="sea_day · port_day"
            hint="Plumbing the ledger reads. Blank follows the setting."
            value={f.kind}
            onChange={(e) => set("kind", e.target.value)}
          />
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
        {/* Both times are read on the harbour's clock, and both are needed: a
            sailing with no return time cannot round long-passage or
            night-reckoning, because those are counted in hours aboard. */}
        <div className="hm-form__row">
          <Input
            label="Returns"
            type="datetime-local"
            hint="Read on the same harbor clock as the departure. Hours aboard decide two marks."
            value={f.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
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
        <div className="hm-form__row">
          <Select
            label="Season"
            options={[{ value: "", label: "Unassigned" }, ...liveSeasons]}
            value={f.seasonId}
            onChange={(e) => set("seasonId", e.target.value)}
          />
          <Select
            label="Venue"
            options={[{ value: "", label: "Unassigned" }, ...liveVenues]}
            value={f.venueId}
            onChange={(e) => set("venueId", e.target.value)}
          />
        </div>
        {/* The sale window: blank on-sale means on sale the moment it is set.
            Presale hours ladder the tiers into it, deepest first. */}
        <div className="hm-form__row">
          <Input
            label="On sale"
            type="datetime-local"
            hint="On the harbor's clock. Blank means on sale now."
            error={dropLate ? ERR_DROP_AFTER_DEPARTURE : undefined}
            value={f.saleOpensAt}
            onChange={(e) => set("saleOpensAt", e.target.value)}
          />
          <Input
            label="Presale hours"
            type="number"
            min={0}
            max={336}
            hint="Each deeper tier enters this many hours earlier."
            value={f.presaleHours}
            onChange={(e) => set("presaleHours", e.target.value)}
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
          {f.deposit ? (
            <Input
              label="Deposit ($)"
              type="number"
              min={0}
              max={DEPOSIT_CEILING}
              step="0.01"
              error={depositOver ? ERR_DEPOSIT_CEILING : undefined}
              value={f.depositAmount}
              onChange={(e) => set("depositAmount", e.target.value)}
            />
          ) : null}
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
