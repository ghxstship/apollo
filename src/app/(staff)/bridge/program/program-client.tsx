"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Stepper, Switch, Table, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import {
  createSeason,
  createSeries,
  createVenue,
  extendSeries,
  setSeasonActive,
  setSeriesActive,
  setVenueActive,
  type VenueKind,
} from "./actions";

export type SeasonPanelRow = {
  id: string;
  slug: string;
  title: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  voyages: number;
  [key: string]: unknown;
};

export type VenuePanelRow = {
  id: string;
  slug: string;
  name: string;
  kind: VenueKind;
  harbor: string | null;
  active: boolean;
  [key: string]: unknown;
};

export type SeriesPanelRow = {
  id: string;
  slug: string;
  title: string;
  cadenceDays: number;
  template: string;
  occurrences: number;
  active: boolean;
  [key: string]: unknown;
};

type Option = { value: string; label: string };

const VENUE_KIND: Record<VenueKind, string> = {
  marina: "Marina",
  club: "Club",
  restaurant: "Restaurant",
  beach: "Beach",
  pool: "Pool",
  partner: "Partner",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/* Seasons carry plain dates, no clock and no zone — read them as written
   rather than routing them through a timezone that could shift the day. */
function onDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "—"} ${day} ${y}`;
}

function standingBadge(active: boolean) {
  return <Badge tone={active ? "positive" : "outline"}>{active ? "Standing" : "Retired"}</Badge>;
}

export function ProgramClient({
  seasons,
  venues,
  series,
  harbors,
  templates,
}: {
  seasons: SeasonPanelRow[];
  venues: VenuePanelRow[];
  series: SeriesPanelRow[];
  harbors: Option[];
  templates: Option[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();

  const [openingSeason, setOpeningSeason] = React.useState(false);
  const [addingVenue, setAddingVenue] = React.useState(false);
  const [layingSeries, setLayingSeries] = React.useState(false);

  /* Season composer. */
  const [sTitle, setSTitle] = React.useState("");
  const [sSlug, setSSlug] = React.useState("");
  const [sStarts, setSStarts] = React.useState("");
  const [sEnds, setSEnds] = React.useState("");
  const [sBlurb, setSBlurb] = React.useState("");

  /* Venue composer. */
  const [vName, setVName] = React.useState("");
  const [vSlug, setVSlug] = React.useState("");
  const [vKind, setVKind] = React.useState<VenueKind>("marina");
  const [vHarbor, setVHarbor] = React.useState("");
  const [vAddress, setVAddress] = React.useState("");

  /* Series composer. */
  const [rTitle, setRTitle] = React.useState("");
  const [rSlug, setRSlug] = React.useState("");
  const [rCadence, setRCadence] = React.useState("7");
  const [rTemplate, setRTemplate] = React.useState("");

  /* Per-series extension counts — 4 forward is a month at the weekly default. */
  const [extendCounts, setExtendCounts] = React.useState<Record<string, number>>({});
  const countFor = (id: string) => extendCounts[id] ?? 4;

  const retire = (
    what: string,
    active: boolean,
    act: () => Promise<{ error?: string }>
  ) =>
    startTransition(async () => {
      const res = await act();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else if (active)
        show({ msg: "Retired. What points at it keeps pointing at it.", meta: what.toUpperCase() });
      else show({ msg: "Back on the program.", meta: what.toUpperCase() });
    });

  const seasonColumns = [
    {
      key: "title",
      label: "Season",
      render: (r: SeasonPanelRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>/{r.slug}</span>
        </span>
      ),
    },
    {
      key: "window",
      label: "Dates",
      width: 190,
      mono: true,
      render: (r: SeasonPanelRow) => `${onDay(r.startsOn)} — ${onDay(r.endsOn)}`,
    },
    { key: "voyages", label: "Sailings", width: 90, mono: true },
    {
      key: "active",
      label: "State",
      width: 100,
      render: (r: SeasonPanelRow) => standingBadge(r.active),
    },
    {
      key: "act",
      label: "",
      width: 70,
      render: (r: SeasonPanelRow) => (
        <Switch
          checked={r.active}
          disabled={pending}
          aria-label={r.active ? `Retire ${r.title}` : `Restore ${r.title}`}
          onChange={() => retire(r.title, r.active, () => setSeasonActive(r.id, !r.active))}
        />
      ),
    },
  ];

  const venueColumns = [
    {
      key: "name",
      label: "Venue",
      render: (r: VenuePanelRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.name}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>/{r.slug}</span>
        </span>
      ),
    },
    {
      key: "kind",
      label: "Kind",
      width: 120,
      render: (r: VenuePanelRow) => VENUE_KIND[r.kind] ?? r.kind,
    },
    {
      key: "harbor",
      label: "Harbor",
      width: 160,
      render: (r: VenuePanelRow) => r.harbor ?? "—",
    },
    {
      key: "active",
      label: "State",
      width: 100,
      render: (r: VenuePanelRow) => standingBadge(r.active),
    },
    {
      key: "act",
      label: "",
      width: 70,
      render: (r: VenuePanelRow) => (
        <Switch
          checked={r.active}
          disabled={pending}
          aria-label={r.active ? `Retire ${r.name}` : `Restore ${r.name}`}
          onChange={() => retire(r.name, r.active, () => setVenueActive(r.id, !r.active))}
        />
      ),
    },
  ];

  const seriesColumns = [
    {
      key: "title",
      label: "Series",
      render: (r: SeriesPanelRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>/{r.slug}</span>
        </span>
      ),
    },
    {
      key: "cadenceDays",
      label: "Cadence",
      width: 100,
      mono: true,
      render: (r: SeriesPanelRow) => `${r.cadenceDays}D`,
    },
    {
      key: "template",
      label: "Template",
      width: 200,
      render: (r: SeriesPanelRow) => r.template,
    },
    { key: "occurrences", label: "Raised", width: 80, mono: true },
    {
      key: "active",
      label: "State",
      width: 100,
      render: (r: SeriesPanelRow) => standingBadge(r.active),
    },
    {
      key: "extend",
      label: "",
      /* Wide enough for the stepper and its button side by side; never
         wider than the table it sits in. */
      width: "min(260px, 100%)",
      render: (r: SeriesPanelRow) =>
        r.active ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Stepper
              size="sm"
              min={1}
              max={26}
              value={countFor(r.id)}
              onChange={(n) => setExtendCounts((c) => ({ ...c, [r.id]: n }))}
              decrementLabel="Fewer sailings"
              incrementLabel="More sailings"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await extendSeries(r.id, countFor(r.id));
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  const raised = res.raised ?? 0;
                  if (raised === 0)
                    show({ msg: "Nothing new — those dates already stand.", meta: r.title.toUpperCase() });
                  else
                    show({
                      msg: `${raised} sailing${raised === 1 ? "" : "s"} raised.`,
                      meta: `${r.title.toUpperCase()} · EVERY ${r.cadenceDays} DAYS`,
                    });
                })
              }
            >
              Extend
            </Button>
          </span>
        ) : null,
    },
    {
      key: "act",
      label: "",
      width: 70,
      render: (r: SeriesPanelRow) => (
        <Switch
          checked={r.active}
          disabled={pending}
          aria-label={r.active ? `Retire ${r.title}` : `Restore ${r.title}`}
          onChange={() => retire(r.title, r.active, () => setSeriesActive(r.id, !r.active))}
        />
      ),
    },
  ];

  return (
    <>
      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>Seasons.</h2>
            <p className="hm-note">
              The frame around the calendar. A retired season stays on the record — its
              sailings point at it and keep pointing at it.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setOpeningSeason(true)}>
            Open a season
          </Button>
        </div>
        {seasons.length ? (
          <div className="hm-panel">
            <Table rowKey={(r: SeasonPanelRow) => r.id} columns={seasonColumns} rows={seasons} />
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No seasons on the books."
              detail="Open the first one and the calendar has a frame to hang sailings in."
            />
          </div>
        )}
      </section>

      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>Venues.</h2>
            <p className="hm-note">
              The places the club returns to — marinas, clubs, restaurants, beaches,
              pools, partners. Retired venues stand aside without leaving the record.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setAddingVenue(true)}>
            Add a venue
          </Button>
        </div>
        {venues.length ? (
          <div className="hm-panel">
            <Table rowKey={(r: VenuePanelRow) => r.id} columns={venueColumns} rows={venues} />
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No venues charted."
              detail="Add the places the club returns to and the composer can offer them."
            />
          </div>
        )}
      </section>

      <section className="hm-sec">
        <div className="hm-head">
          <div>
            <h2>Series.</h2>
            <p className="hm-note">
              A series clones its template forward at the cadence. Extending is safe to
              repeat — dates that already hold a sailing are skipped, not doubled.
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={() => setLayingSeries(true)}>
            Lay a series
          </Button>
        </div>
        {series.length ? (
          <div className="hm-panel">
            <Table rowKey={(r: SeriesPanelRow) => r.id} columns={seriesColumns} rows={series} />
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <StateBlock
              status="empty"
              title="No series laid."
              detail="Raise one sailing by hand on Voyages, then make it the template here."
            />
          </div>
        )}
      </section>

      <Dialog
        open={openingSeason}
        onClose={() => setOpeningSeason(false)}
        eyebrow="THE BRIDGE · OPEN A SEASON"
        title="Open a season"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpeningSeason(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createSeason({
                    title: sTitle,
                    slug: sSlug,
                    startsOn: sStarts,
                    endsOn: sEnds,
                    blurb: sBlurb,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setOpeningSeason(false);
                  setSTitle("");
                  setSSlug("");
                  setSStarts("");
                  setSEnds("");
                  setSBlurb("");
                  show({ msg: "Opened.", meta: "SEASON ON THE BOOKS" });
                })
              }
            >
              Open it
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={sTitle} onChange={(e) => setSTitle(e.target.value)} />
          <Input
            label="Address"
            hint="Left blank, it comes from the name."
            value={sSlug}
            onChange={(e) => setSSlug(e.target.value)}
          />
          <Input label="Starts" type="date" value={sStarts} onChange={(e) => setSStarts(e.target.value)} />
          <Input label="Ends" type="date" value={sEnds} onChange={(e) => setSEnds(e.target.value)} />
          <Input
            label="Blurb"
            hint="One line for the calendar. Optional."
            value={sBlurb}
            onChange={(e) => setSBlurb(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={addingVenue}
        onClose={() => setAddingVenue(false)}
        eyebrow="THE BRIDGE · ADD A VENUE"
        title="Add a venue"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddingVenue(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createVenue({
                    name: vName,
                    slug: vSlug,
                    kind: vKind,
                    harborId: vHarbor || null,
                    address: vAddress,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setAddingVenue(false);
                  setVName("");
                  setVSlug("");
                  setVKind("marina");
                  setVHarbor("");
                  setVAddress("");
                  show({ msg: "Charted.", meta: "VENUE ON THE PROGRAM" });
                })
              }
            >
              Add it
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={vName} onChange={(e) => setVName(e.target.value)} />
          <Input
            label="Address"
            hint="Left blank, it comes from the name."
            value={vSlug}
            onChange={(e) => setVSlug(e.target.value)}
          />
          <Select label="Kind" value={vKind} onChange={(e) => setVKind(e.target.value as VenueKind)}>
            {(Object.keys(VENUE_KIND) as VenueKind[]).map((k) => (
              <option key={k} value={k}>
                {VENUE_KIND[k]}
              </option>
            ))}
          </Select>
          <Select
            label="Harbor"
            hint="Where it sits. A venue can stand free of any harbor."
            value={vHarbor}
            onChange={(e) => setVHarbor(e.target.value)}
            options={[{ value: "", label: "No harbor — freestanding" }, ...harbors]}
          />
          <Input
            label="Street address"
            hint="As it reads on an invitation. Optional."
            value={vAddress}
            onChange={(e) => setVAddress(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={layingSeries}
        onClose={() => setLayingSeries(false)}
        eyebrow="THE BRIDGE · LAY A SERIES"
        title="Lay a series"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLayingSeries(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createSeries({
                    title: rTitle,
                    slug: rSlug,
                    cadenceDays: Number(rCadence) || 0,
                    templateVoyageId: rTemplate || null,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setLayingSeries(false);
                  setRTitle("");
                  setRSlug("");
                  setRCadence("7");
                  setRTemplate("");
                  show({ msg: "Laid.", meta: "EXTEND IT WHEN READY" });
                })
              }
            >
              Lay it
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
          <Input
            label="Address"
            hint="Left blank, it comes from the name."
            value={rSlug}
            onChange={(e) => setRSlug(e.target.value)}
          />
          <Input
            label="Cadence"
            hint="Days between sailings — 7 is weekly. 1 to 92."
            type="number"
            value={rCadence}
            onChange={(e) => setRCadence(e.target.value)}
          />
          <Select
            label="Template voyage"
            hint="Occurrences inherit everything — format, deposit, presale window."
            value={rTemplate}
            onChange={(e) => setRTemplate(e.target.value)}
            options={[
              {
                value: "",
                label: templates.length
                  ? "Pick the sailing"
                  : "Nothing on the board — raise one on Voyages first",
              },
              ...templates,
            ]}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
