"use client";

import React from "react";
import { Badge, Button, Input, Select, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { saveCity, saveVessel } from "./actions";

export type CityCard = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timeZone: string;
  coordinates: string;
  launchYear: string;
  position: string;
};

export type VesselCard = {
  id: string;
  name: string;
  capacity: string;
  homeCity: string;
  dayRate: string;
  lengthFt: string;
  year: string;
  cabins: string;
  active: boolean;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "waitlist", label: "Waitlist" },
  { value: "soon", label: "Soon" },
  { value: "closed", label: "Closed" },
];

const STATUS_TONE: Record<string, "positive" | "outline" | "caution"> = {
  open: "positive",
  waitlist: "outline",
  soon: "outline",
  closed: "caution",
};

const NEW_CITY: Omit<CityCard, "id"> = {
  name: "", slug: "", status: "soon", timeZone: "America/New_York", coordinates: "", launchYear: "", position: "",
};
const NEW_VESSEL: Omit<VesselCard, "id"> = {
  name: "", capacity: "", homeCity: "", dayRate: "", lengthFt: "", year: "", cabins: "", active: true,
};

const same = <T extends object>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

export function FleetClient({ cities, vessels }: { cities: CityCard[]; vessels: VesselCard[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [cityDraft, setCityDraft] = React.useState<Record<string, Omit<CityCard, "id">>>(() =>
    Object.fromEntries(cities.map(({ id, ...rest }) => [id, rest]))
  );
  const [vesselDraft, setVesselDraft] = React.useState<Record<string, Omit<VesselCard, "id">>>(() =>
    Object.fromEntries(vessels.map(({ id, ...rest }) => [id, rest]))
  );
  const [newCity, setNewCity] = React.useState<Omit<CityCard, "id"> | null>(null);
  const [newVessel, setNewVessel] = React.useState<Omit<VesselCard, "id"> | null>(null);

  const cityOptions = cities.map((c) => ({ value: c.id, label: c.name }));

  const runCity = (id: string | null, d: Omit<CityCard, "id">, after?: () => void) =>
    startTransition(async () => {
      const res = await saveCity(id, {
        name: d.name, slug: d.slug, status: d.status, time_zone: d.timeZone,
        coordinates: d.coordinates, launch_year: d.launchYear, position: d.position,
      });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: `${d.name || "City"} saved.`, meta: "FLEET" });
        after?.();
      }
    });

  const runVessel = (id: string | null, d: Omit<VesselCard, "id">, after?: () => void) =>
    startTransition(async () => {
      const res = await saveVessel(id, {
        name: d.name, capacity: d.capacity, home_city: d.homeCity, day_rate: d.dayRate,
        length_ft: d.lengthFt, year: d.year, cabins: d.cabins, active: d.active,
      });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: `${d.name || "Hull"} saved.`, meta: "FLEET" });
        after?.();
      }
    });

  const cityFields = (d: Omit<CityCard, "id">, set: (p: Partial<Omit<CityCard, "id">>) => void) => (
    <>
      <div className="hm-plan__ids">
        <Input label="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label="Slug" placeholder="los-angeles" value={d.slug} onChange={(e) => set({ slug: e.target.value })} />
        <Select label="Status" options={STATUS_OPTIONS} value={d.status} onChange={(e) => set({ status: e.target.value })} />
        <Input label="Time zone" placeholder="America/Los_Angeles" value={d.timeZone} onChange={(e) => set({ timeZone: e.target.value })} />
      </div>
      <div className="hm-plan__ids">
        <Input label="Coordinates" placeholder="33.9803° N — 118.4517° W" value={d.coordinates} onChange={(e) => set({ coordinates: e.target.value })} />
        <Input label="Launch year" type="number" min={2020} max={2100} value={d.launchYear} onChange={(e) => set({ launchYear: e.target.value })} />
        <Input label="Position" type="number" min={1} max={99} value={d.position} onChange={(e) => set({ position: e.target.value })} />
      </div>
    </>
  );

  const vesselFields = (d: Omit<VesselCard, "id">, set: (p: Partial<Omit<VesselCard, "id">>) => void) => (
    <>
      <div className="hm-plan__ids">
        <Input label="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <Input label="Capacity" type="number" min={0} max={2000} value={d.capacity} onChange={(e) => set({ capacity: e.target.value })} />
        <Select label="Home city" placeholder="No home city" options={cityOptions} value={d.homeCity} onChange={(e) => set({ homeCity: e.target.value })} />
        <Input label="Day rate ($)" type="number" min={0} step="0.01" placeholder="until the contract says" value={d.dayRate} onChange={(e) => set({ dayRate: e.target.value })} />
      </div>
      <div className="hm-plan__ids">
        <Input label="Length (ft)" type="number" min={1} max={1000} value={d.lengthFt} onChange={(e) => set({ lengthFt: e.target.value })} />
        <Input label="Year" type="number" min={1900} max={2100} value={d.year} onChange={(e) => set({ year: e.target.value })} />
        <Input label="Cabins" type="number" min={0} max={200} value={d.cabins} onChange={(e) => set({ cabins: e.target.value })} />
        <label className="hm-check">
          <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
          <span>In service</span>
        </label>
      </div>
    </>
  );

  return (
    <>
      <section className="hm-sec">
        <div className="hm-head">
          <h2>Cities.</h2>
          <div className="hm-acts">
            <Button variant="outline" size="sm" disabled={pending || !!newCity} onClick={() => setNewCity({ ...NEW_CITY, position: String(cities.length + 1) })}>
              Open a city
            </Button>
          </div>
        </div>
        <div className="hm-plans">
          {newCity ? (
            <div className="hm-plan">
              <div className="hm-plan__head">
                <b>New city</b>
                <Badge tone="caution">Not saved</Badge>
              </div>
              {cityFields(newCity, (p) => setNewCity((s) => (s ? { ...s, ...p } : s)))}
              <div className="hm-acts" style={{ marginTop: 12 }}>
                <Button variant="ghost" size="sm" onClick={() => setNewCity(null)}>Not now</Button>
                <Button variant="gold" size="sm" disabled={pending} onClick={() => runCity(null, newCity, () => setNewCity(null))}>Open it</Button>
              </div>
            </div>
          ) : null}
          {cities.map((c) => {
            const { id, ...saved } = c;
            const d = cityDraft[id];
            const dirty = !same(d, saved);
            return (
              <div key={id} className="hm-plan">
                <div className="hm-plan__head">
                  <b>{c.name}</b>
                  <span className="hm-mono">{c.timeZone.toUpperCase()}</span>
                  <Badge tone={STATUS_TONE[c.status] ?? "outline"}>{c.status}</Badge>
                </div>
                {cityFields(d, (p) => setCityDraft((s) => ({ ...s, [id]: { ...s[id], ...p } })))}
                <div className="hm-acts" style={{ marginTop: 12 }}>
                  <Button variant={dirty ? "gold" : "outline"} size="sm" disabled={pending || !dirty} onClick={() => runCity(id, d)}>
                    {dirty ? "Save" : "Saved"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="hm-sec">
        <div className="hm-head">
          <h2>Hulls.</h2>
          <div className="hm-acts">
            <Button variant="outline" size="sm" disabled={pending || !!newVessel} onClick={() => setNewVessel({ ...NEW_VESSEL })}>
              Name a hull
            </Button>
          </div>
        </div>
        <div className="hm-plans">
          {newVessel ? (
            <div className="hm-plan">
              <div className="hm-plan__head">
                <b>New hull</b>
                <Badge tone="caution">Not saved</Badge>
              </div>
              {vesselFields(newVessel, (p) => setNewVessel((s) => (s ? { ...s, ...p } : s)))}
              <div className="hm-acts" style={{ marginTop: 12 }}>
                <Button variant="ghost" size="sm" onClick={() => setNewVessel(null)}>Not now</Button>
                <Button variant="gold" size="sm" disabled={pending} onClick={() => runVessel(null, newVessel, () => setNewVessel(null))}>Name it</Button>
              </div>
            </div>
          ) : null}
          {vessels.map((v) => {
            const { id, ...saved } = v;
            const d = vesselDraft[id];
            const dirty = !same(d, saved);
            return (
              <div key={id} className={"hm-plan" + (v.active ? "" : " hm-plan--blocked")}>
                <div className="hm-plan__head">
                  <b>{v.name}</b>
                  <span className="hm-mono">
                    {v.capacity} ABOARD{v.dayRate ? ` · $${Number(v.dayRate).toLocaleString()} / DAY` : " · NO DAY RATE"}
                  </span>
                  {!v.active ? <Badge tone="outline">Laid up</Badge> : null}
                </div>
                {vesselFields(d, (p) => setVesselDraft((s) => ({ ...s, [id]: { ...s[id], ...p } })))}
                <div className="hm-acts" style={{ marginTop: 12 }}>
                  <Button variant={dirty ? "gold" : "outline"} size="sm" disabled={pending || !dirty} onClick={() => runVessel(id, d)}>
                    {dirty ? "Save" : "Saved"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
