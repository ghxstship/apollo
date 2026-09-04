"use client";

import React from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  FilterPills,
  Input,
  ListToolbar,
  Progress,
  Select,
  Stat,
  StateBlock,
  Stepper,
  Toast,
} from "@/components/ds";
import {
  EXPERIENCE_CLASSES,
  EXPERIENCE_CLASS_IDS,
  PLACE,
  SETTING_LABEL,
  SUB_CLASSES,
  SURFACES,
  type ExperienceClassId,
} from "@/lib/brand";
import type { EpisodeSetting, MembershipTier, EpisodeStatus } from "@/lib/supabase/types";
import { useToast } from "../../ui";
import {
  assignVessel,
  createEpisode,
  removeVessel,
  saveEpisodeDoor,
  saveEpisodeOps,
  saveEpisodeProgram,
  setPassesTotal,
  setHeldPasses,
  setEpisodeStatus,
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

export type EpisodeOpsRow = {
  id: string;
  title: string;
  setting: string;
  subClass: string | null;
  /* open | club | premium | exotic — the second axis. */
  experienceClass: string;
  kind: string;
  departs: string;
  startsAtIso: string;
  /* The departure on the city's wall clock, as a datetime-local value — the
     same frame the on-sale input is typed in, so the two compare as strings. */
  startsAtLocal: string;
  vessels: number;
  hulls: AssignedHull[];
  aboard: number;
  passes: number;
  held: number;
  price: string;
  priceCents: number;
  status: EpisodeStatus;
  /* Where this episode stands in an edition: the template an edition clones
     forward, an occurrence raised from one, or neither. */
  edition: { role: "template" | "occurrence"; title: string; occurrences: number } | null;
  muster: string;
  wind: string;
  swell: string;
  heading: string;
  speed: string;
  /* — the program: filing, season, venue, sale window, deposit — */
  series: string | null;
  /* The catalogue's name for that filing — what the board leads with, because
     it is what a member reads on the card. Null when the episode is unfiled. */
  seriesLabel: string | null;
  seasonId: string | null;
  venueId: string | null;
  /* Wall clock on the city, as a datetime-local value; "" = on sale now. */
  saleOpensAtLocal: string;
  presaleHours: number;
  depositCents: number;
  /* — the door — */
  byRequest: boolean;
  standbyPasses: number;
  ageLine: string;
};

/* A retired season, venue or series stays in the picker, marked, so an episode
   that holds one reads as what it is rather than as Unassigned. The composer
   offers only the live ones for a new filing. */
export type ProgramOption = { value: string; label: string; retired?: boolean };

export type SeriesOption = ProgramOption & {
  category: string;
  /* What this series files an episode as. Naming the series hands the column
     over to the trigger, so the composer shows this instead of pretending the
     operator's own pick still counts. */
  experienceClass: string;
  access: string;
  /* "open · $350 · seats 40", "by invitation", "on request", "included" */
  accessLine: string;
  priceCents: number | null;
  capacity: number | null;
};

/* A series' category settles the setting: port → ashore, sea → afloat. The
   category column now holds only those two — how far the club goes moved to
   experience_class — so anything else leaves the setting as the operator set
   it rather than guessing. */
function settingForCategory(category: string, current: EpisodeSetting): EpisodeSetting {
  if (category === "port") return "shore";
  if (category === "sea") return "sea";
  return current;
}

/* What a_sailing_honours_its_series will refuse, said here before the submit
   rather than by the trigger after it. Each names the way out. */
function seriesConflicts(series: SeriesOption | undefined, passes: number, priceCents: number): string[] {
  if (!series) return [];
  const out: string[] = [];
  if (series.access === "included" && priceCents > 0) {
    out.push(
      `${series.label} is included with a pass and never sold alone — the board will refuse a price. Clear the price, or file it under another series.`
    );
  }
  if (series.capacity !== null && passes > series.capacity) {
    out.push(
      `A ${series.label} seats ${series.capacity} — the board will refuse ${passes} passes. Lower the capacity, or file it under another series.`
    );
  }
  return out;
}

const DEPOSIT_CEILING = 1000;
const ERR_DEPOSIT_CEILING = "A deposit is at most $1,000.";
const ERR_DROP_AFTER_DEPARTURE = "The drop has to open before the boat leaves.";

/* Both values are wall clocks on the same city, in datetime-local form, so
   the string order is the time order. */
function dropAfterDeparture(saleOpensAt: string, startsAt: string): boolean {
  return !!saleOpensAt && !!startsAt && saleOpensAt > startsAt;
}

function seriesOptions(all: SeriesOption[], blank: string): ProgramOption[] {
  return [{ value: "", label: blank }, ...all.map((f) => ({ value: f.value, label: `${f.label} · ${f.accessLine}` }))];
}

/* The four rungs of the second axis, in ladder order. */
const EXPERIENCE_OPTIONS = EXPERIENCE_CLASS_IDS.map((id) => ({
  value: id,
  label: `${EXPERIENCE_CLASSES[id].label} — ${EXPERIENCE_CLASSES[id].what}`,
}));

/* Said the same way in both dialogs: the class is the operator's to set only
   while the episode is unfiled. a_sailing_keeps_its_taxonomy copies it off the
   series on every write that names one, so a control that looked live under a
   chosen series would be promising an edit the board will undo. */
function experienceClassHint(series: SeriesOption | undefined): string {
  if (!series) return "Yours to set while this episode is unfiled.";
  const files = EXPERIENCE_CLASSES[series.experienceClass as ExperienceClassId];
  return files
    ? `Follows the series — ${series.label} files as ${files.label}.`
    : "Follows the series.";
}

/* What an episode is, in the words a member reads it in: its series' name, or
   where it happens when it belongs to no series, then how long it runs. The
   class and the ladder key used to print here instead, which named the filing
   system rather than the thing. */
function identityLine(row: {
  seriesLabel: string | null;
  setting: string;
  subClass: string | null;
  experienceClass: string;
}): string[] {
  const hours = row.subClass ? SUB_CLASSES[row.subClass]?.label : null;
  const experience = EXPERIENCE_CLASSES[row.experienceClass as ExperienceClassId]?.label;
  return [
    row.seriesLabel ?? SETTING_LABEL[row.setting] ?? row.setting,
    ...(hours ? [hours] : []),
    ...(experience ? [experience] : []),
  ];
}

/* The 3rd-yacht rule as product logic — a flotilla forms at 30 passes. */
const FLOTILLA_FORMS_AT = 30;

function insideT72(row: EpisodeOpsRow): boolean {
  const ms = new Date(row.startsAtIso).getTime() - Date.now();
  return ms > 0 && ms <= 72 * 3600 * 1000;
}

/* Short of the flotilla line inside 72 hours, on an episode that is still going
   out — the one state on this screen that costs the club money if nobody looks.
   Read twice: once for the meter's severity, once for the board's tally. */
function holdingShort(row: EpisodeOpsRow): boolean {
  return (
    row.setting === "sea" &&
    row.vessels > 0 &&
    row.aboard < FLOTILLA_FORMS_AT &&
    insideT72(row) &&
    (row.status === "scheduled" || row.status === "live" || row.status === "weather_hold")
  );
}

function FlotillaMeter({ row }: { row: EpisodeOpsRow }) {
  if (row.setting !== "sea" || row.vessels === 0) return null;
  const holding = holdingShort(row);
  /* The bar carried the brand accent whatever it read, so an episode at 8 of 30
     inside T-72 was the same colour as one at 30 of 30. Severity on the fill:
     the line met is positive, short inside T-72 is the danger case, and short
     with time still on the clock is a caution. */
  const tone = holding
    ? "ls-progress--danger"
    : row.aboard >= FLOTILLA_FORMS_AT
      ? "ls-progress--positive"
      : "ls-progress--caution";
  return (
    <div style={{ marginTop: 12, maxWidth: 460 }}>
      <Progress
        thick
        className={tone}
        value={(row.aboard / FLOTILLA_FORMS_AT) * 100}
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            FLOTILLA FORMS AT {FLOTILLA_FORMS_AT} — profitable at 3 yachts
            {holding ? <Badge tone="danger">Under 30 inside T-72h</Badge> : null}
          </span>
        }
        detail={`${row.aboard} / ${FLOTILLA_FORMS_AT} · ${row.vessels} ${row.vessels === 1 ? "YACHT" : "YACHTS"}`}
      />
    </div>
  );
}

const STATUS_TONE: Record<EpisodeStatus, "gold" | "ink" | "positive" | "caution" | "outline"> = {
  scheduled: "outline",
  live: "gold",
  weather_hold: "caution",
  completed: "positive",
  cancelled: "ink",
};

const STATUS_LABEL: Record<EpisodeStatus, string> = {
  scheduled: "Scheduled",
  live: "Live",
  weather_hold: "Weather hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

/* The board carries every episode it has ever raised, and the two an operator
   is usually after are the live one and the one on hold. Same shape as the
   ledger's filter on Orders. */
type StatusFilter = "all" | EpisodeStatus;

const STATUS_FILTERS: Array<[StatusFilter, string]> = [
  ["all", "All"],
  ["scheduled", STATUS_LABEL.scheduled],
  ["live", STATUS_LABEL.live],
  ["weather_hold", STATUS_LABEL.weather_hold],
  ["completed", STATUS_LABEL.completed],
  ["cancelled", STATUS_LABEL.cancelled],
];

type StatusMove = {
  to: EpisodeStatus;
  label: string;
  title: string;
  body: string;
  confirm: string;
  tone: "positive" | "caution" | "ink";
  /* Cancel refunds every account and cannot be walked back, and it rendered
     from the same map as Mark completed and Call weather hold — three
     identical outline buttons in a row, the destructive one in the middle.
     The map now carries which move is the one that cannot be undone, and both
     the row button and its confirmation read it. */
  destructive?: boolean;
};

function movesFor(status: EpisodeStatus): StatusMove[] {
  const hold: StatusMove = {
    to: "weather_hold",
    label: "Call weather hold",
    title: "Call the weather hold?",
    body: "Every pass gets the word by email and in their inbox. We call it by 18:00 the night before.",
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
    title: "Cancel the episode?",
    body: "Cancelling credits every account in full and sends the word — the trigger does it, no forms.",
    confirm: "Cancel the episode",
    tone: "caution",
    destructive: true,
  };
  if (status === "scheduled") return [hold, complete, cancel];
  if (status === "live") return [hold, complete, cancel];
  if (status === "weather_hold") return [lift, complete, cancel];
  return [];
}

type ProgramForm = {
  series: string;
  experienceClass: ExperienceClassId;
  seasonId: string;
  venueId: string;
  saleOpensAt: string;
  presaleHours: string;
  deposit: string;
};

export function EpisodesClient({
  rows,
  cities,
  seasons,
  venues,
  seriesList,
  fleet,
}: {
  rows: EpisodeOpsRow[];
  cities: Array<{ value: string; label: string }>;
  seasons: ProgramOption[];
  venues: ProgramOption[];
  seriesList: SeriesOption[];
  fleet: FleetVessel[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [move, setMove] = React.useState<{ row: EpisodeOpsRow; m: StatusMove } | null>(null);
  const [ops, setOps] = React.useState<EpisodeOpsRow | null>(null);
  const [opsForm, setOpsForm] = React.useState({ wind: "", swell: "", heading: "", speed: "", muster: "" });
  const [door, setDoor] = React.useState<EpisodeOpsRow | null>(null);
  const [doorForm, setDoorForm] = React.useState({ byRequest: false, standby: "0", ageLine: "" });
  const [program, setProgram] = React.useState<EpisodeOpsRow | null>(null);
  const [programForm, setProgramForm] = React.useState<ProgramForm>({
    series: "",
    experienceClass: "club",
    seasonId: "",
    venueId: "",
    saleOpensAt: "",
    presaleHours: "24",
    deposit: "50",
  });
  const [creating, setCreating] = React.useState(false);
  /* The flotilla dialog holds the episode's ID, not the row: the rows prop is
     refreshed by revalidatePath after every assign/remove, and a captured row
     object would keep showing the flotilla as it stood when the dialog opened. */
  const [flotillaId, setFlotillaId] = React.useState<string | null>(null);
  const flotilla = flotillaId ? (rows.find((r) => r.id === flotillaId) ?? null) : null;
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");

  /* The tally is the whole board, never the filtered slice — a summary that
     moved with the filter would be answering a different question each time. */
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (!q || r.title.toLowerCase().includes(q) || (r.seriesLabel ?? "").toLowerCase().includes(q))
  );
  const totals = rows.reduce(
    (t, r) => ({ aboard: t.aboard + r.aboard, passes: t.passes + r.passes }),
    { aboard: 0, passes: 0 }
  );
  const shortInsideT72 = rows.filter(holdingShort).length;

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const openOps = (row: EpisodeOpsRow) => {
    setOpsForm({ wind: row.wind, swell: row.swell, heading: row.heading, speed: row.speed, muster: row.muster });
    setOps(row);
  };

  const openDoor = (row: EpisodeOpsRow) => {
    setDoorForm({ byRequest: row.byRequest, standby: String(row.standbyPasses), ageLine: row.ageLine });
    setDoor(row);
  };

  const openProgram = (row: EpisodeOpsRow) => {
    setProgramForm({
      series: row.series ?? "",
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
     button says why rather than the toast afterwards. The series ones are the
     trigger's; the deposit and drop ones are the CHECKs'. */
  const programSeries = seriesList.find((f) => f.value === programForm.series);
  const seriesRefusals = program ? seriesConflicts(programSeries, program.passes, program.priceCents) : [];
  const programRefusals = [
    ...seriesRefusals,
    ...(Number(programForm.deposit || "0") > DEPOSIT_CEILING ? [ERR_DEPOSIT_CEILING] : []),
    ...(program && dropAfterDeparture(programForm.saleOpensAt, program.startsAtLocal) ? [ERR_DROP_AFTER_DEPARTURE] : []),
  ];

  return (
    <>
      {/* The board had no aggregate at all: an operator counted rows to learn
          how many episodes were on it, and there was no way to see from the top
          that one of them was short of the flotilla line inside 72 hours. The
          four figures the room actually asks for, before the detail. */}
      <div className="hm-row">
        <Stat size="sm" label="On the board" value={rows.length} />
        <Stat
          size="sm"
          label="On weather hold"
          value={rows.filter((v) => v.status === "weather_hold").length}
        />
        <Stat
          size="sm"
          label="Aboard"
          value={`${totals.aboard} / ${totals.passes}`}
          sub="ABOARD VS CAPACITY"
        />
        <Stat size="sm" label="Under 30 inside T-72" value={shortInsideT72} />
      </div>

      <div className="hm-head" style={{ marginTop: 20 }}>
        <p className="hm-note" style={{ marginTop: 0 }}>
          Holds, completions, and cancellations fan out to every pass — each one asks first. Held
          passes are off sale — capacity for sale = total − holds.
        </p>
        <Button variant="gold" size="sm" onClick={() => setCreating(true)}>
          New episode
        </Button>
      </div>

      <ListToolbar
        search={
          <Input
            label="Search the board"
            placeholder="A title, or a series"
            aria-label="Search the board"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        filterCount={statusFilter === "all" ? 0 : 1}
        filters={
          <FilterPills
            label="Status"
            value={statusFilter}
            onChange={(next) => setStatusFilter(next as StatusFilter)}
            options={STATUS_FILTERS.filter(([id]) => id !== "all").map(([id, label]) => ({
              id,
              label,
              count: rows.filter((r) => r.status === id).length,
            }))}
            allCount={rows.length}
          />
        }
        chips={statusFilter === "all" ? [] : [{ key: "status", label: "Status", value: STATUS_LABEL[statusFilter] }]}
        onDropChip={() => setStatusFilter("all")}
        onClear={() => setStatusFilter("all")}
        resultCount={shown.length}
        resultNoun="episode"
        countSuffix={` of ${rows.length} on the board`}
      />

      {shown.map((v) => (
        <div className="hm-voy" key={v.id}>
          <div className="hm-voy__head">
            <b>{v.title}</b>
            <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
            {v.byRequest ? <Badge tone="ink">By request</Badge> : null}
            {v.standbyPasses > 0 ? <Badge tone="outline">Standby {v.standbyPasses}</Badge> : null}
          </div>
          <div className="hm-voy__meta">
            <span>{v.departs}</span>
            {/* Series name and hours, the pairing a member sees — never the
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
              {v.aboard} ABOARD / {v.passes} PASSES
            </span>
            <span>·</span>
            <span>
              {v.held} HELD · {Math.max(0, v.passes - v.held)} FOR SALE
            </span>
            <span>·</span>
            <span>{v.price}</span>
            {v.edition ? (
              <>
                <span>·</span>
                <span title={v.edition.role === "template" ? "The episode an edition clones forward" : "Raised from an edition template"}>
                  {v.edition.role === "template" ? "SERIES TEMPLATE" : "SERIES OCCURRENCE"} · {v.edition.title.toUpperCase()}
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
                value={v.passes}
                onChange={(n) =>
                  run(
                    () => setPassesTotal(v.id, n),
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
                max={v.passes}
                value={v.held}
                onChange={(n) =>
                  run(
                    () => setHeldPasses(v.id, n),
                    () =>
                      show({
                        msg: "Holds set.",
                        meta: `${v.title.toUpperCase()} · ${n} HELD · ${Math.max(0, v.passes - n)} FOR SALE`,
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
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => openDoor(v)}>
              Door
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setFlotillaId(v.id)}>
              Flotilla
            </Button>
            {movesFor(v.status).map((m) => (
              <Button
                key={m.to + m.label}
                variant={m.destructive ? "danger" : "outline"}
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

      {shown.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <StateBlock
            status="empty"
            icon="CalendarDays"
            title={rows.length === 0 ? "Nothing on the board." : "Nothing on the board under that filter."}
            detail={rows.length === 0 ? "Set the first episode." : "Widen the search, or clear the filter."}
          />
        </div>
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
                variant={move.m.destructive ? "danger" : "outline"}
                disabled={pending}
                onClick={() => {
                  const { row, m } = move;
                  setMove(null);
                  run(
                    () => setEpisodeStatus(row.id, m.to),
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
                      saveEpisodeOps(
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

      {/* — The door: how the night admits. — */}
      <Dialog
        open={!!door}
        onClose={() => setDoor(null)}
        width={440}
        eyebrow={door ? door.title : ""}
        title="The door."
        footer={
          door ? (
            <>
              <Button variant="ghost" onClick={() => setDoor(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const row = door;
                  setDoor(null);
                  run(
                    () =>
                      saveEpisodeDoor(row.id, {
                        byRequest: doorForm.byRequest,
                        standbyPasses: Number(doorForm.standby) || 0,
                        ageLine: doorForm.ageLine,
                      }),
                    () => show({ msg: "Door set.", meta: row.title.toUpperCase() })
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
          <Checkbox
            label="By request"
            description="Places are asked for and the Bridge offers them from Composition; the card never shows a number of passes."
            checked={doorForm.byRequest}
            onChange={(e) => setDoorForm((f) => ({ ...f, byRequest: e.target.checked }))}
          />
          <Input
            label="Standby passes"
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            hint="Passes past the ceiling that board only into a seat a no-show frees. 0 to 50."
            value={doorForm.standby}
            onChange={(e) => setDoorForm((f) => ({ ...f, standby: e.target.value }))}
          />
          <Input
            label="Age line"
            maxLength={40}
            placeholder="30s and 40s"
            hint="One phrase on the card about who the night is for. Blank says nothing."
            value={doorForm.ageLine}
            onChange={(e) => setDoorForm((f) => ({ ...f, ageLine: e.target.value }))}
          />
        </div>
      </Dialog>

      {/* — The program: file an existing episode under a series, season and
          venue, and set its sale window and deposit. The columns landed after
          most episodes did; this is how the board catches up. — */}
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
                      saveEpisodeProgram(row.id, {
                        series: programForm.series || null,
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
          {program?.edition?.role === "template" ? (
            <p className="hm-note" style={{ marginTop: 0 }}>
              {program.edition.occurrences === 1
                ? "1 occurrence will not follow this change"
                : `${program.edition.occurrences} occurrences will not follow this change`}{" "}
              — an edition copies its template forward when it is extended, not when the template is edited.
            </p>
          ) : null}
          <div className="hm-form__row">
            <Select
              label={SURFACES.series}
              options={seriesOptions(seriesList, SURFACES.special)}
              value={programForm.series}
              hint={programSeries ? programSeries.accessLine : undefined}
              error={seriesRefusals.length ? seriesRefusals.join(" ") : undefined}
              onChange={(e) => setProgramForm((f) => ({ ...f, series: e.target.value }))}
            />
            {/* Next to the series, because the series is what decides it the
                moment one is named. */}
            <Select
              label="Experience class"
              options={EXPERIENCE_OPTIONS}
              value={programForm.experienceClass}
              hint={experienceClassHint(programSeries)}
              disabled={Boolean(programSeries)}
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
              hint="On the city's clock. Blank means on sale now."
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
          /* Keyed on the episode so pick, position and the remove confirmation
             reset when the dialog moves to another episode. */
          <FlotillaBody key={flotilla.id} row={flotilla} fleet={fleet} pending={pending} onRun={run} notify={show} />
        ) : null}
      </Dialog>

      <NewEpisodeDialog
        open={creating}
        onClose={() => setCreating(false)}
        cities={cities}
        seasons={seasons}
        venues={venues}
        seriesList={seriesList}
        pending={pending}
        onCreate={(input, title) =>
          run(
            () => createEpisode(input),
            () => {
              setCreating(false);
              show({ msg: "Episode on the board.", meta: title.toUpperCase(), tone: "positive" });
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
   episode_vessels since the fleet landed and never had a writer. Assigning is
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
  row: EpisodeOpsRow;
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
          <ul className="hm-body" style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
            {row.hulls.map((h) => (
              <li key={h.vesselId} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <span className="hm-mono" style={{ minWidth: 24 }}>
                  {h.position}
                </span>
                <span style={{ flex: 1 }}>
                  {h.name}
                  <span style={{ color: "var(--text-3)" }}> · {h.capacity} passes</span>
                </span>
                {arming === h.vesselId ? (
                  <>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArming(null)}>
                      Keep it
                    </Button>
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(h)}>
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
              Passes already spread onto this hull keep their hull note — spread
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
              ...open.map((v) => ({ value: v.id, label: `${v.name} · ${v.capacity} passes` })),
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
        <p className="hm-note">Every active hull in the fleet is already on this episode.</p>
      )}
    </div>
  );
}

type ItineraryDraft = { offset: string; title: string; note: string };

type NewEpisodeForm = {
  title: string;
  slug: string;
  setting: EpisodeSetting;
  subClass: string;
  experienceClass: ExperienceClassId;
  cityId: string;
  startsAt: string;
  endsAt: string;
  distance: string;
  passes: number;
  price: string;
  minTier: MembershipTier;
  media: string;
  deposit: boolean;
  depositAmount: string;
  series: string;
  saleOpensAt: string;
  presaleHours: string;
  seasonId: string;
  venueId: string;
  itinerary: ItineraryDraft[];
};

const BLANK: NewEpisodeForm = {
  title: "",
  slug: "",
  setting: "sea",
  subClass: "passage",
  /* The members' standard is the honest default — most of what the club raises
     is a club episode, and the operator says so when it is not. */
  experienceClass: "club",
  cityId: "",
  startsAt: "",
  endsAt: "",
  distance: "",
  passes: 24,
  price: "",
  minTier: "regional",
  media: "dawn",
  deposit: false,
  depositAmount: "50",
  series: "",
  saleOpensAt: "",
  presaleHours: "24",
  seasonId: "",
  venueId: "",
  itinerary: [],
};

/* One duration ladder whichever setting an episode runs in — afloat and ashore
   both climb the same three rungs. The labels are hour phrases now, and the
   note is the same range said again ("Up to 4 hours — Under 4 hours"), so the
   phrase stands alone and the range rides along as the picker's hint. */
function subClassOptions(): Array<{ value: string; label: string }> {
  return Object.entries(SUB_CLASSES).map(([value, s]) => ({ value, label: s.label }));
}

function NewEpisodeDialog({
  open,
  onClose,
  cities,
  seasons,
  venues,
  seriesList,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  cities: Array<{ value: string; label: string }>;
  seasons: ProgramOption[];
  venues: ProgramOption[];
  seriesList: SeriesOption[];
  pending: boolean;
  onCreate: (input: Parameters<typeof createEpisode>[0], title: string) => void;
}) {
  const [f, setF] = React.useState<NewEpisodeForm>(BLANK);
  const set = <K extends keyof NewEpisodeForm>(k: K, v: NewEpisodeForm[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  /* A new filing goes under a live season, venue or series — the retired ones
     are in the lists only so existing episodes can still show theirs. */
  const liveSeasons = seasons.filter((s) => !s.retired);
  const liveVenues = venues.filter((v) => !v.retired);
  const liveSeries = seriesList.filter((x) => !x.retired);

  /* The setting picks the duration ladder — keep the two in step. The kind
     column is plumbing the taxonomy trigger derives from the setting; the
     composer used to offer it as free text, and it was the one field on this
     form that could be typed wrong. */
  const withSetting = (prev: NewEpisodeForm, setting: EpisodeSetting): NewEpisodeForm => ({
    ...prev,
    setting,
    subClass: prev.subClass || (subClassOptions()[0]?.value ?? ""),
  });
  const setSetting = (setting: EpisodeSetting) => setF((prev) => withSetting(prev, setting));

  /* Choosing a series settles the setting from its category — a port series
     runs ashore, a sea series afloat. It settles the experience class too, at
     the board, which is why that control goes quiet once one is named. */
  const setSeries = (slug: string) =>
    setF((prev) => {
      const chosen = liveSeries.find((x) => x.value === slug);
      const next = { ...prev, series: slug };
      if (!chosen) return next;
      const setting = settingForCategory(chosen.category, prev.setting);
      return setting === prev.setting ? next : withSetting(next, setting);
    });

  const chosenSeries = liveSeries.find((x) => x.value === f.series);
  const priceCents = f.price.trim() ? Math.round(Number(f.price) * 100) : 0;
  const seriesRefusals = seriesConflicts(chosenSeries, f.passes, priceCents);
  const depositOver = f.deposit && Number(f.depositAmount || "0") > DEPOSIT_CEILING;
  const dropLate = dropAfterDeparture(f.saleOpensAt, f.startsAt);
  const refused = seriesRefusals.length > 0 || depositOver || dropLate;

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
        setting: f.setting,
        subClass: (f.subClass || null) as SubClass | null,
        experienceClass: f.experienceClass,
        cityId: f.cityId || null,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        distanceNm: f.distance.trim() ? Number(f.distance) : null,
        passes: f.passes,
        priceCents: f.price.trim() ? Math.round(Number(f.price) * 100) : 0,
        minTier: f.minTier,
        media: f.media,
        depositRequired: f.deposit,
        depositCents: f.depositAmount.trim() ? Math.round(Number(f.depositAmount) * 100) : 5000,
        series: f.series || null,
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
      eyebrow="Episodes"
      title="A new line on the manifest."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button variant="gold" disabled={pending || !f.title || !f.startsAt || !f.endsAt || refused} onClick={submit}>
            Set the episode
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
            the other taxonomy axis — sits with the series below, because the
            series is what settles it. */}
        <div className="hm-form__row">
          <Select
            label="Setting"
            options={[
              { value: "sea", label: SETTING_LABEL.sea },
              { value: "shore", label: SETTING_LABEL.shore },
            ]}
            hint="Where it happens. Only ashore admits an unvetted guest."
            value={f.setting}
            onChange={(e) => setSetting(e.target.value as EpisodeSetting)}
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
            label={SURFACES.series}
            options={seriesOptions(liveSeries, SURFACES.special)}
            value={f.series}
            hint={
              chosenSeries
                ? `${chosenSeries.accessLine} · the series sets the setting from its category`
                : `The series sets the setting from its category. Left blank, the episode is a ${SURFACES.special}.`
            }
            error={seriesRefusals.length ? seriesRefusals.join(" ") : undefined}
            onChange={(e) => setSeries(e.target.value)}
          />
          {/* The other axis. Live only for an unfiled episode — naming a series
              hands the column to the taxonomy trigger, and the hint says so
              rather than letting the control look like it still decides. */}
          <Select
            label="Experience class"
            options={EXPERIENCE_OPTIONS}
            value={f.experienceClass}
            hint={experienceClassHint(chosenSeries)}
            disabled={Boolean(chosenSeries)}
            onChange={(e) => set("experienceClass", e.target.value as ExperienceClassId)}
          />
        </div>
        <div className="hm-form__row">
          <Select
            label={PLACE.market}
            options={[{ value: "", label: "Unassigned" }, ...cities]}
            value={f.cityId}
            onChange={(e) => set("cityId", e.target.value)}
          />
          <Input label="Departs" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </div>
        {/* Both times are read on the city's clock, and both are needed: an
            episode with no return time cannot round long-passage or
            night-reckoning, because those are counted in hours aboard. */}
        <div className="hm-form__row">
          <Input
            label="Returns"
            type="datetime-local"
            hint="Read on the same city clock as the departure. Hours aboard decide two marks."
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
            hint="On the city's clock. Blank means on sale now."
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
            <Stepper size="sm" min={1} max={96} value={f.passes} onChange={(n) => set("passes", n)} />
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
