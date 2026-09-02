"use client";

import React from "react";
import { Badge, Button, Checkbox, Dialog, Input, Select, StateBlock, Table, Textarea, Toast } from "@/components/ds";
import {
  DEPARTMENTS,
  ELEMENT_GRAINS,
  ELEMENT_KINDS,
  ELEMENT_STATES,
  ELEMENT_TIERS,
  FIVE_A_LABEL,
  FIVE_A_PHASES,
  PRICE_CONFIDENCES,
  PRODUCTION_PHASES,
  WEATHER_CLASSES,
  WEATHER_TOLERANCE,
  type Department,
  type ElementGrain,
  type ElementKind,
  type ElementState,
  type ElementTier,
  type FiveAPhase,
  type PriceConfidence,
  type ProductionPhase,
  type WeatherClass,
} from "@/types/elements";
import { useToast } from "../../ui";
import { removeElement, saveElement, type ElementInput } from "./actions";

export type ElementListRow = {
  id: string;
  elementId: string;
  urid: string;
  name: string;
  department: Department;
  discipline: string;
  category: string;
  kind: ElementKind;
  tier: ElementTier;
  phase: ProductionPhase;
  grain: ElementGrain;
  elementState: ElementState;
  specifications: string;
  uom: string;
  qty: number;
  unitCostUsd: number;
  totalCostUsd: number | null;
  priceConfidence: PriceConfidence;
  sense: string;
  fiveA: FiveAPhase;
  clientVisible: boolean;
  criticalPath: boolean;
  weather: WeatherClass;
  substitute: string;
  [key: string]: unknown;
};

const WEATHER_LABEL: Record<WeatherClass, string> = {
  waterproof_marine: "Waterproof marine",
  all_weather: "All weather",
  indoor_only: "Indoor only",
};

const BLANK: ElementInput = {
  elementId: "",
  urid: "",
  name: "",
  department: "5000 Production",
  discipline: "",
  category: "",
  kind: "equipment",
  tier: "04 Physical",
  phase: "Operate",
  grain: "class",
  elementState: "Draft",
  specifications: "",
  uom: "item·event",
  qty: 1,
  unitCostUsd: 0,
  priceConfidence: "BENCHMARKED",
  sense: "",
  fiveA: "arrival",
  clientVisible: false,
  criticalPath: false,
  weather: "waterproof_marine",
  substitute: "",
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function stateTone(s: ElementState): "positive" | "caution" | "outline" {
  if (s === "Active") return "positive";
  if (s === "Draft") return "caution";
  return "outline";
}

export function ElementsClient({ rows }: { rows: ElementListRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [form, setForm] = React.useState<{ id: string | null; f: ElementInput } | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<ElementListRow | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [phase, setPhase] = React.useState("");

  const set = <K extends keyof ElementInput>(k: K, v: ElementInput[K]) =>
    setForm((cur) => (cur ? { ...cur, f: { ...cur.f, [k]: v } } : cur));

  const openNew = () => setForm({ id: null, f: { ...BLANK } });
  const openEdit = (r: ElementListRow) =>
    setForm({
      id: r.id,
      f: {
        elementId: r.elementId,
        urid: r.urid,
        name: r.name,
        department: r.department,
        discipline: r.discipline,
        category: r.category,
        kind: r.kind,
        tier: r.tier,
        phase: r.phase,
        grain: r.grain,
        elementState: r.elementState,
        specifications: r.specifications,
        uom: r.uom,
        qty: r.qty,
        unitCostUsd: r.unitCostUsd,
        priceConfidence: r.priceConfidence,
        sense: r.sense,
        fiveA: r.fiveA,
        clientVisible: r.clientVisible,
        criticalPath: r.criticalPath,
        weather: r.weather,
        substitute: r.substitute,
      },
    });

  const commit = () =>
    startTransition(async () => {
      if (!form) return;
      const res = await saveElement(form.id, form.f);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({
          msg: form.id ? "Element saved." : "Element filed.",
          meta: form.f.elementId.toUpperCase(),
        });
        setForm(null);
      }
    });

  const drop = (r: ElementListRow) =>
    startTransition(async () => {
      const res = await removeElement(r.id);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({ msg: "Element removed from the catalogue." });
        setConfirmRemove(null);
      }
    });

  const q = filter.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.elementId.toLowerCase().includes(q) ||
        r.urid.includes(q)) &&
      (!dept || r.department === dept) &&
      (!phase || r.fiveA === phase)
  );

  /* The one specification error the schema exists to catch, shown rather than
     enforced here — the database already refuses to commit an Active one, so
     anything listed is a Draft or Retired row on its way to becoming a
     problem. */
  const unsubstituted = rows.filter(
    (r) => r.fiveA === "activity" && r.weather === "indoor_only" && !r.substitute
  );

  const uncovered = FIVE_A_PHASES.filter((p) => !rows.some((r) => r.fiveA === p));

  const columns = [
    {
      key: "name",
      label: "Element",
      render: (r: ElementListRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.name}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
            {r.elementId} · {r.urid}
          </span>
        </span>
      ),
    },
    {
      key: "department",
      label: "Department",
      width: 170,
      render: (r: ElementListRow) => (
        <span>
          {r.department}
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.discipline}</span>
        </span>
      ),
    },
    {
      key: "fiveA",
      label: "Five-A",
      width: 110,
      render: (r: ElementListRow) => FIVE_A_LABEL[r.fiveA],
    },
    {
      key: "weather",
      label: "Weather",
      width: 150,
      render: (r: ElementListRow) => (
        <span className="hm-mono">{WEATHER_LABEL[r.weather].toUpperCase()}</span>
      ),
    },
    {
      key: "cost",
      label: "Total",
      width: 110,
      mono: true,
      render: (r: ElementListRow) => usd(r.totalCostUsd ?? r.qty * r.unitCostUsd),
    },
    {
      key: "state",
      label: "State",
      width: 110,
      render: (r: ElementListRow) => (
        <span>
          <Badge tone={stateTone(r.elementState)}>{r.elementState}</Badge>
          {r.criticalPath ? (
            <span className="hm-mono" style={{ display: "block", marginTop: 4, color: "var(--gold-bright)" }}>
              CRITICAL PATH
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "act",
      label: "",
      width: 120,
      render: (r: ElementListRow) => (
        <span className="hm-acts">
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
            Edit
          </Button>
        </span>
      ),
    },
  ];

  const f = form?.f;
  const substituteRequired = !!f && f.fiveA === "activity" && f.weather === "indoor_only";

  return (
    <>
      <div className="hm-filters">
        <div className="hm-filters__grow">
          <Input
            label="Find"
            placeholder="Name, element key, or URID"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Select
          label="Department"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          options={[{ value: "", label: "Every department" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
        />
        <Select
          label="Five-A"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          options={[
            { value: "", label: "Every phase" },
            ...FIVE_A_PHASES.map((p) => ({ value: p, label: FIVE_A_LABEL[p] })),
          ]}
        />
        <span className="hm-filters__acts">
          <Button variant="gold" size="sm" onClick={openNew}>
            File an element
          </Button>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="hm-sec">
          <StateBlock
            status="empty"
            icon="Package"
            title="The catalogue is empty."
            detail="Every produced element — signage, swag, print, equipment, credential — is filed against the element schema. Until one is, the Show board's kit panel says nothing is specified, because nothing is."
          />
        </div>
      ) : (
        <div className="hm-sec">
          <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => openEdit(r)} />
          <span className="hm-count">
            {shown.length} of {rows.length} elements
            {uncovered.length
              ? ` · ${uncovered.map((p) => FIVE_A_LABEL[p]).join(", ")} uncovered`
              : " · every Five-A phase covered"}
          </span>
          {unsubstituted.length ? (
            <p className="hm-note" role="status" style={{ color: "var(--caution)" }}>
              {unsubstituted.map((r) => r.elementId).join(", ")} —{" "}
              {unsubstituted.length === 1 ? "is" : "are"} indoor_only in the
              activity phase with no named substitute. The database refuses to
              make one Active until it names what runs instead.
            </p>
          ) : null}
        </div>
      )}

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        width={720}
        eyebrow={form?.id ? form.f.elementId : "Elements"}
        title={form?.id ? "Edit the element" : "File an element"}
        footer={
          <>
            {form?.id ? (
              <Button
                variant="ghost"
                onClick={() => {
                  const row = rows.find((r) => r.id === form.id) ?? null;
                  setForm(null);
                  setConfirmRemove(row);
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button variant="gold" disabled={pending} onClick={commit}>
              {form?.id ? "Save the element" : "File it"}
            </Button>
          </>
        }
      >
        {f ? (
          <div className="hm-form">
            <div className="hm-form__row">
              <Input
                label="Element key"
                value={f.elementId}
                onChange={(e) => set("elementId", e.target.value)}
                hint="Prefixed by family — SIG-01, SWG-03, PRN-02."
              />
              <Input
                label="URID"
                value={f.urid}
                onChange={(e) => set("urid", e.target.value)}
                hint="DDDD.CC.NNN, and the first segment is the department's number."
              />
            </div>
            <Input label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />

            <div className="hm-form__row">
              <Select
                label="Department"
                value={f.department}
                onChange={(e) => set("department", e.target.value as Department)}
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              />
              <Input
                label="Discipline"
                value={f.discipline}
                onChange={(e) => set("discipline", e.target.value)}
                hint="Signage &amp; Wayfinding, Scenic Fabrication, Guest Amenities."
              />
            </div>
            <div className="hm-form__row">
              <Input
                label="Category"
                value={f.category}
                onChange={(e) => set("category", e.target.value)}
              />
              <Select
                label="Kind"
                value={f.kind}
                onChange={(e) => set("kind", e.target.value as ElementKind)}
                options={ELEMENT_KINDS.map((k) => ({ value: k, label: k }))}
              />
            </div>

            <div className="hm-form__row">
              <Select
                label="Tier"
                value={f.tier}
                onChange={(e) => set("tier", e.target.value as ElementTier)}
                options={ELEMENT_TIERS.map((t) => ({ value: t, label: t }))}
              />
              <Select
                label="Production phase"
                value={f.phase}
                onChange={(e) => set("phase", e.target.value as ProductionPhase)}
                options={PRODUCTION_PHASES.map((p) => ({ value: p, label: p }))}
                hint="When it is handled — not when the guest meets it."
              />
            </div>
            <div className="hm-form__row">
              <Select
                label="Grain"
                value={f.grain}
                onChange={(e) => set("grain", e.target.value as ElementGrain)}
                options={ELEMENT_GRAINS.map((g) => ({ value: g, label: g }))}
                hint="A class is the specification; an instance is a numbered thing."
              />
              <Select
                label="State"
                value={f.elementState}
                onChange={(e) => set("elementState", e.target.value as ElementState)}
                options={ELEMENT_STATES.map((s) => ({ value: s, label: s }))}
              />
            </div>

            <Textarea
              label="Specification"
              rows={3}
              value={f.specifications}
              onChange={(e) => set("specifications", e.target.value)}
              hint="Carried verbatim onto artwork specs — prose for a fabricator, not a summary."
            />

            <div className="hm-form__row">
              <Input
                label="Unit of measure"
                value={f.uom}
                onChange={(e) => set("uom", e.target.value)}
                hint="item·event, item·unit, set·event, lot·event, item·sailing."
              />
              <Input
                label="Quantity"
                type="number"
                min={0}
                step="any"
                value={String(f.qty)}
                onChange={(e) => set("qty", Number(e.target.value) || 0)}
              />
            </div>
            <div className="hm-form__row">
              <Input
                label="Unit cost, USD"
                type="number"
                min={0}
                step="0.01"
                value={String(f.unitCostUsd)}
                onChange={(e) => set("unitCostUsd", Number(e.target.value) || 0)}
                hint={`Totals to ${usd(f.qty * f.unitCostUsd)}.`}
              />
              <Select
                label="Price confidence"
                value={f.priceConfidence}
                onChange={(e) => set("priceConfidence", e.target.value as PriceConfidence)}
                options={PRICE_CONFIDENCES.map((p) => ({ value: p, label: p }))}
                hint="Budget rolls up by this — a total that mixes quotes with guesses says so."
              />
            </div>

            <div className="hm-form__row">
              <Select
                label="Five-A phase"
                value={f.fiveA}
                onChange={(e) => set("fiveA", e.target.value as FiveAPhase)}
                options={FIVE_A_PHASES.map((p) => ({ value: p, label: FIVE_A_LABEL[p] }))}
                hint="When in the guest's day it appears."
              />
              <Select
                label="Weather class"
                value={f.weather}
                onChange={(e) => set("weather", e.target.value as WeatherClass)}
                options={WEATHER_CLASSES.map((w) => ({ value: w, label: WEATHER_LABEL[w] }))}
                hint={WEATHER_TOLERANCE[f.weather]}
              />
            </div>

            {substituteRequired ? (
              <Textarea
                label="What runs instead"
                rows={2}
                value={f.substitute}
                onChange={(e) => set("substitute", e.target.value)}
                hint="Indoor only, in the two hours of the day furthest from a roof. Name the substitute — moved indoors is not a substitute on a boat."
                error={f.substitute.trim() ? undefined : "Required before this element can go Active."}
              />
            ) : null}

            <Input
              label="Sense"
              value={f.sense}
              onChange={(e) => set("sense", e.target.value)}
              hint="Sensory channels, slash-separated — Sight / Touch."
            />

            <Checkbox
              label="The guest sees it"
              description="Client-visible elements must satisfy the imagery and type canon; internal ones need only the spec."
              checked={f.clientVisible}
              onChange={(e) => set("clientVisible", e.target.checked)}
            />
            <Checkbox
              label="Critical path"
              description="The episode cannot run without it. The run-of-show board filters on this."
              checked={f.criticalPath}
              onChange={(e) => set("criticalPath", e.target.checked)}
            />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        eyebrow="Elements"
        title="Remove this element?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Keep it
            </Button>
            <Button variant="gold" disabled={pending} onClick={() => confirmRemove && drop(confirmRemove)}>
              Remove it
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
          {confirmRemove?.elementId} — {confirmRemove?.name} leaves the
          catalogue, and its substitute goes with it. Retiring it instead keeps
          the specification and the cost history where a rollup can still read
          them.
        </p>
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
