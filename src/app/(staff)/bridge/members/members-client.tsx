"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Dialog, FilterPills, Input, ListToolbar, Select, StateBlock, Table, Textarea, Toast, type ToolbarChip } from "@/components/ds";
import { CLUB_ZONE, LEAGUES, PLACE, knots } from "@/lib/brand";
import { logDate, logDateTime, price } from "@/lib/format";
import { useToast } from "../../ui";
import {
  adjustKnots,
  bulkAdjustKnots,
  bulkSetStatus,
  bulkWord,
  compDues,
  loadMember,
  removeSegment,
  saveSegment,
  setMemberStatus,
  verifyPhone,
  type MemberDetail,
  type SegmentFilters,
} from "./actions";

export type MemberRow = {
  id: string;
  name: string;
  memberNo: string;
  email: string;
  tier: string;
  tierLabel: string;
  planId: string;
  planLabel: string;
  league: number;
  leagueName: string;
  citySlug: string;
  cityCode: string;
  status: string;
  dues: string;
  duesLabel: string;
  passes: number;
  attended: number;
  knots: number;
  lastBooked: string | null;
  staff: boolean;
  [key: string]: unknown;
};

export type SegmentOption = { id: string; name: string; filters: SegmentFilters };

const EMPTY: SegmentFilters = {
  city: "",
  tier: "",
  plan: "",
  league: "",
  status: "",
  dues: "",
  recent: false,
  q: "",
};

const DUES_TONE: Record<string, "gold" | "ink" | "positive" | "caution" | "outline"> = {
  active: "positive",
  trialing: "gold",
  past_due: "caution",
  paused: "outline",
  canceled: "caution",
  incomplete: "outline",
  none: "outline",
};

const DUES_OPTIONS = [
  { value: "active", label: "Paid up" },
  { value: "trialing", label: "Trial" },
  { value: "past_due", label: "Past due" },
  { value: "paused", label: "Paused" },
  { value: "canceled", label: "Ended" },
  { value: "incomplete", label: "Incomplete" },
  { value: "none", label: "No dues" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "departed", label: "Departed" },
];

const TIER_LABEL: Record<string, string> = { regional: "Regional", national: "National", global: "Global" };

/* The standing badge in the drawer. A dues hold is named as such, because it
   is the one hold that lifts on its own — when the dues clear — and the
   operator should know before they reach for the button that they need not. */
function standing(detail: MemberDetail): { label: string; tone: "positive" | "caution" | "outline" } {
  if (detail.status === "departed") return { label: "Departed", tone: "outline" };
  if (detail.status === "paused") {
    return detail.holdReason === "dues"
      ? { label: "Held — dues", tone: "caution" }
      : { label: "Paused", tone: "caution" };
  }
  return { label: "Active", tone: "positive" };
}

const DUES_HOLD_NOTE = "Lifts when dues clear; a word from the Bridge lifts it now";

const CSV_COLUMNS: Array<[string, (r: MemberRow) => string]> = [
  ["Member", (r) => r.name],
  ["Member no", (r) => r.memberNo],
  ["Email", (r) => r.email],
  ["Tier", (r) => r.tierLabel],
  ["Plan", (r) => r.planLabel],
  ["League", (r) => r.leagueName],
  [PLACE.market, (r) => r.cityCode],
  ["Passes", (r) => String(r.passes)],
  ["Attended", (r) => String(r.attended)],
  ["Knots", (r) => String(r.knots)],
  ["Last booked", (r) => (r.lastBooked ? r.lastBooked.slice(0, 10) : "")],
  ["Dues", (r) => r.duesLabel],
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function MembersClient({
  rows,
  segments,
  cities,
  plans,
  recentCutoff,
}: {
  rows: MemberRow[];
  segments: SegmentOption[];
  cities: Array<{ slug: string; label: string }>;
  plans: Array<{ id: string; label: string }>;
  recentCutoff: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [f, setF] = React.useState<SegmentFilters>(EMPTY);

  /* What is in force, as the toolbar's chips — one per axis, each removable.
     Reads the filter object rather than a second list, so a filter added later
     cannot be silently left out. The search is not a chip: it has its own
     field on the bar. */
  const chips = React.useMemo<ToolbarChip[]>(() => {
    const out: ToolbarChip[] = [];
    if (f.city) out.push({ key: "city", label: PLACE.market, value: cities.find((h) => h.slug === f.city)?.label ?? f.city });
    if (f.tier) out.push({ key: "tier", label: "Tier", value: TIER_LABEL[f.tier] ?? f.tier });
    if (f.plan) out.push({ key: "plan", label: "Plan", value: plans.find((p) => p.id === f.plan)?.label ?? "Set" });
    if (f.league) out.push({ key: "league", label: "League", value: LEAGUES.find((l) => String(l.league) === f.league)?.name ?? `League ${f.league}` });
    if (f.status) out.push({ key: "status", label: "Standing", value: STATUS_OPTIONS.find((o) => o.value === f.status)?.label ?? f.status });
    if (f.dues) out.push({ key: "dues", label: "Dues", value: DUES_OPTIONS.find((o) => o.value === f.dues)?.label ?? f.dues });
    if (f.recent) out.push({ key: "recent", label: "Sailed", value: "In the last 90 days" });
    return out;
  }, [f, cities, plans]);
  const [segmentId, setSegmentId] = React.useState("");
  const [naming, setNaming] = React.useState(false);
  const [segmentName, setSegmentName] = React.useState("");
  const [openRow, setOpenRow] = React.useState<MemberRow | null>(null);
  const [detail, setDetail] = React.useState<MemberDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [knotDelta, setKnotDelta] = React.useState("");
  const [knotReason, setKnotReason] = React.useState("");
  /* Comp dues: a date and, if the member has none, a plan. */
  const [comping, setComping] = React.useState(false);
  const [compUntil, setCompUntil] = React.useState("");
  const [compPlan, setCompPlan] = React.useState("");
  /* The selection — ids, never rows, so a filter change cannot strand a stale
     copy. What is acted on is the selection AS SHOWN: ticking twenty, then
     narrowing to five, acts on five. */
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = React.useState<"hold" | "lift" | "knots" | "word" | null>(null);
  const [bulkDelta, setBulkDelta] = React.useState("");
  const [bulkReason, setBulkReason] = React.useState("");
  const [bulkTitle, setBulkTitle] = React.useState("");
  const [bulkBody, setBulkBody] = React.useState("");

  const set = <K extends keyof SegmentFilters>(key: K, value: SegmentFilters[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setSegmentId("");
  };

  const dropChip = (key: string) => {
    if (key === "recent") set("recent", false);
    else set(key as keyof Omit<SegmentFilters, "recent">, "");
  };
  const clearAxes = () => {
    setF((prev) => ({ ...EMPTY, q: prev.q }));
    setSegmentId("");
  };

  const filtered = React.useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f.city && r.citySlug !== f.city) return false;
      if (f.tier && r.tier !== f.tier) return false;
      if (f.plan && r.planId !== f.plan) return false;
      if (f.league && String(r.league) !== f.league) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.dues && r.dues !== f.dues) return false;
      if (f.recent && !(r.lastBooked && r.lastBooked >= recentCutoff)) return false;
      if (q) {
        const hay = `${r.name} ${r.memberNo} ${r.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, f, recentCutoff]);

  const chosen = filtered.filter((r) => selected.has(r.id));
  const allShown = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShown) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = (fn: (ids: string[]) => Promise<{ error?: string; note?: string; landed?: number; failed?: number }>, verb: string) => {
    const ids = chosen.map((r) => r.id);
    setBulk(null);
    startTransition(async () => {
      const res = await fn(ids);
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      const landed = res.landed ?? ids.length;
      const failed = res.failed ?? 0;
      show({
        msg: res.note ?? (failed ? `${verb} for ${landed}; ${failed} did not land.` : `${verb} for ${landed}.`),
        meta: `${landed} OF ${ids.length} MEMBERS`,
        tone: res.note || failed ? "caution" : "positive",
      });
      if (!failed) setSelected(new Set());
    });
  };

  const applySegment = (id: string) => {
    setSegmentId(id);
    const seg = segments.find((s) => s.id === id);
    setF(seg ? seg.filters : EMPTY);
  };

  const exportCsv = () => {
    const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(",");
    const body = filtered.map((r) => CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `un-members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show({ msg: "File written.", meta: `${filtered.length} ROWS · CSV` });
  };

  const openMember = (row: MemberRow) => {
    setOpenRow(row);
    setDetail(null);
    setLoading(true);
    startTransition(async () => {
      const res = await loadMember(row.id);
      setLoading(false);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else setDetail(res.detail ?? null);
    });
  };

  const columns = [
    {
      key: "pick",
      label: <span className="ls-visually-hidden">Selected</span>,
      width: 36,
      /* A tick inside a clickable row: the click stops here so it does not
         also open the drawer. Enter/Space on the row itself still opens it. */
      render: (r: MemberRow) => (
        <span className="hm-pick" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${r.name}`}
            checked={selected.has(r.id)}
            onChange={() => toggleOne(r.id)}
          />
        </span>
      ),
    },
    {
      key: "name",
      label: "Member",
      render: (r: MemberRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.name}</b>
          <span className="hm-mono" style={{ display: "block", marginTop: 2 }}>
            {r.memberNo}
            {r.staff ? " · CREW" : ""}
          </span>
        </span>
      ),
    },
    { key: "tierLabel", label: "Tier", width: 90 },
    { key: "planLabel", label: "Plan", width: 130 },
    {
      key: "league",
      label: "League",
      width: 90,
      mono: true,
      render: (r: MemberRow) => <span title={r.leagueName}>{`L${r.league}`}</span>,
    },
    { key: "cityCode", label: PLACE.market, width: 80, mono: true },
    { key: "passes", label: "Passes", width: 70, mono: true },
    { key: "attended", label: "Aboard", width: 70, mono: true },
    {
      key: "knots",
      label: "Knots",
      width: 90,
      mono: true,
      render: (r: MemberRow) => r.knots.toLocaleString("en-US"),
    },
    {
      key: "lastBooked",
      label: "Last booked",
      width: 110,
      mono: true,
      render: (r: MemberRow) => (r.lastBooked ? logDate(r.lastBooked, CLUB_ZONE) : "—"),
    },
    {
      key: "dues",
      label: "Dues",
      width: 100,
      render: (r: MemberRow) => <Badge tone={DUES_TONE[r.dues] ?? "outline"}>{r.duesLabel}</Badge>,
    },
  ];

  return (
    <>
      {/* Six selects, a search, a checkbox and four buttons stood above the
          roster in a bar of their own — about 350px of chrome before row one
          on a phone, folded behind a summary below 900px. THE list toolbar
          now: search on the bar, the axes in the Filter tray, what is in force
          as chips, the saved views and the export riding the bar. */}
      <ListToolbar
        search={
          <Input
            label="Search the roll"
            placeholder="Name, member no, email"
            aria-label="Search the roll"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
          />
        }
        filterCount={chips.length}
        filters={
          <>
            <FilterPills
              label="Tier"
              value={f.tier || "all"}
              onChange={(next) => set("tier", next === "all" ? "" : next)}
              allLabel="Any tier"
              options={Object.entries(TIER_LABEL).map(([id, label]) => ({
                id,
                label,
                count: rows.filter((r) => r.tier === id).length,
              }))}
            />
            <FilterPills
              label="Standing"
              value={f.status || "all"}
              onChange={(next) => set("status", next === "all" ? "" : next)}
              allLabel="Any standing"
              options={STATUS_OPTIONS.map((o) => ({
                id: o.value,
                label: o.label,
                count: rows.filter((r) => r.status === o.value).length,
              }))}
            />
            <FilterPills
              label="Dues"
              value={f.dues || "all"}
              onChange={(next) => set("dues", next === "all" ? "" : next)}
              allLabel="Any dues state"
              options={DUES_OPTIONS.map((o) => ({
                id: o.value,
                label: o.label,
                count: rows.filter((r) => r.dues === o.value).length,
              }))}
            />
            <FilterPills
              label="League"
              value={f.league || "all"}
              onChange={(next) => set("league", next === "all" ? "" : next)}
              allLabel="Any league"
              options={LEAGUES.map((l) => ({
                id: String(l.league),
                label: l.name,
                count: rows.filter((r) => r.league === l.league).length,
              }))}
            />
            <Select
              label={PLACE.market}
              value={f.city}
              onChange={(e) => set("city", e.target.value)}
              options={[{ value: "", label: "Every city" }, ...cities.map((h) => ({ value: h.slug, label: h.label }))]}
            />
            <Select
              label="Plan"
              value={f.plan}
              onChange={(e) => set("plan", e.target.value)}
              options={[{ value: "", label: "Any plan" }, ...plans.map((p) => ({ value: p.id, label: p.label }))]}
            />
            <Checkbox
              label="Sailed in the last 90 days"
              checked={f.recent}
              onChange={(e) => set("recent", e.target.checked)}
            />
          </>
        }
        chips={chips}
        onDropChip={dropChip}
        onClear={clearAxes}
        actions={
          <>
            <Select
              aria-label="Saved views"
              value={segmentId}
              onChange={(e) => applySegment(e.target.value)}
              options={[
                { value: "", label: segments.length ? "Load a view" : "No view saved yet" },
                ...segments.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => setNaming(true)}>
              Save this view
            </Button>
            {segmentId ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const id = segmentId;
                  startTransition(async () => {
                    const res = await removeSegment(id);
                    if (res.error) show({ msg: res.error, tone: "danger" });
                    else {
                      setSegmentId("");
                      show({ msg: "View dropped.", meta: "SAVED VIEW REMOVED" });
                    }
                  });
                }}
              >
                Drop view
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" disabled={!filtered.length} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" disabled={!filtered.length} onClick={toggleAllShown}>
              {allShown ? "Clear selection" : "Select all shown"}
            </Button>
          </>
        }
        resultCount={filtered.length}
        resultNoun="member"
        countSuffix={` of ${rows.length} on the roll`}
      />

      {/* The bulk bar. It exists only while something is ticked, and every
          button on it names the count before it asks. */}
      {chosen.length ? (
        <div className="hm-bulk" role="region" aria-label="Selected members">
          <span className="hm-mono">
            {chosen.length} {chosen.length === 1 ? "MEMBER" : "MEMBERS"} SELECTED
            {selected.size > chosen.length ? ` · ${selected.size - chosen.length} MORE OUTSIDE THIS FILTER` : ""}
          </span>
          <span className="hm-acts">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setBulk("hold")}>
              Hold
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setBulk("lift")}>
              Lift hold
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => { setBulkDelta(""); setBulkReason(""); setBulk("knots"); }}>
              Adjust knots
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => { setBulkTitle(""); setBulkBody(""); setBulk("word"); }}>
              Send a word
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </span>
        </div>
      ) : null}

      {filtered.length ? (
        <div className="hm-panel">
          <Table rowKey={(r: MemberRow) => r.id} columns={columns} rows={filtered} onRowClick={openMember} />
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <StateBlock
            status="empty"
            title="Nobody matches that."
            detail="Widen the filters — or the segment is simply empty this season."
          />
        </div>
      )}

      <Dialog
        open={naming}
        onClose={() => setNaming(false)}
        width={420}
        eyebrow="Saved view"
        title="Name this view."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const name = segmentName;
                const filters = f;
                startTransition(async () => {
                  const res = await saveSegment(name, filters);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    setNaming(false);
                    setSegmentName("");
                    show({ msg: "View saved.", meta: "SEGMENT · REUSABLE" });
                  }
                });
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: "var(--text-sm)" }}>
            The filters as they stand are stored with the name — load it again from the Saved views
            list.
          </p>
          <Input
            label="Name"
            placeholder="Global members in MIA, sailed twice"
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={!!openRow}
        onClose={() => setOpenRow(null)}
        width={560}
        eyebrow={openRow ? openRow.memberNo : ""}
        title={openRow ? openRow.name : ""}
      >
        {loading || !detail ? (
          <StateBlock status="loading" bare title="Hauling the record in." detail="A moment." />
        ) : (
          <div className="hm-form">
            <div>
              <span className="hm-mono">STANDING</span>
              <p style={{ fontSize: "var(--text-sm)", marginTop: 4, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone={standing(detail).tone}>{standing(detail).label}</Badge>
                {detail.holdReason === "dues" ? (
                  <span style={{ color: "var(--text-2)" }}>{DUES_HOLD_NOTE}.</span>
                ) : null}
              </p>
            </div>
            <div>
              <span className="hm-mono">CONTACT</span>
              <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
                {detail.email} · {detail.phone}
                {detail.phone !== "—" ? (
                  <>
                    {" "}
                    <Badge tone={detail.phoneVerified ? "positive" : "outline"}>
                      {detail.phoneVerified ? "Number verified" : "Unverified"}
                    </Badge>
                  </>
                ) : null}
                <br />
                {detail.handle} · joined {logDate(detail.joined, CLUB_ZONE)}
              </p>
            </div>
            <div>
              <span className="hm-mono">PLAN AND DUES</span>
              <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
                {detail.planLine} — {detail.duesLine}
                <br />
                House account: {detail.balanceCents ? price(Math.abs(detail.balanceCents)) : "Complimentary"}
                {detail.balanceCents < 0 ? " owing" : " on hand"}
                {detail.compedUntil ? (
                  <>
                    <br />
                    <Badge tone="gold">Complimentary until {logDate(detail.compedUntil, null)}</Badge>
                  </>
                ) : null}
              </p>
            </div>
            <div>
              <span className="hm-mono">KNOTS — {knots(detail.knotsBalance).toUpperCase()} ON THE LEDGER</span>
              {detail.knotsRecent.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                  {detail.knotsRecent.map((k) => (
                    <li key={k.id} style={{ display: "flex", gap: 10, padding: "3px 0" }}>
                      <span className="hm-mono" style={{ minWidth: 96 }}>
                        {logDateTime(k.when, CLUB_ZONE)}
                      </span>
                      <span style={{ flex: 1 }}>{k.reason}</span>
                      <span className="hm-mono">{knots(k.delta)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>Nothing banked yet.</p>
              )}
            </div>
            <div>
              <span className="hm-mono">RECENT PASSES</span>
              {detail.passes.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: "var(--text-sm)" }}>
                  {detail.passes.map((p) => (
                    <li key={p.id} style={{ display: "flex", gap: 10, padding: "3px 0" }}>
                      <span className="hm-mono" style={{ minWidth: 96 }}>
                        {logDate(p.when, p.zone || null)}
                      </span>
                      <span style={{ flex: 1 }}>{p.title}</span>
                      <span className="hm-mono">{p.status.replace("_", " ").toUpperCase()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>No passes on the record.</p>
              )}
            </div>
            <div className="hm-acts">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setHolding(true)}
              >
                {detail.status === "departed"
                  ? "Bring them back"
                  : detail.status === "paused"
                    ? detail.holdReason === "dues"
                      ? "Lift the hold now"
                      : "Resume membership"
                    : "Pause membership"}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setAdjusting(true)}>
                Correct knots
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setCompUntil(detail.compedUntil ?? "");
                  setCompPlan(detail.planId ?? "");
                  setComping(true);
                }}
              >
                {detail.compedUntil ? "Change the comp" : "Comp dues"}
              </Button>
              {!detail.phoneVerified ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setVerifying(true)}>
                  Mark number verified
                </Button>
              ) : null}
              <Link className="ls-btn ls-btn--outline ls-btn--sm" href="/bridge/manifests">
                Manifests
              </Link>
              <Link className="ls-btn ls-btn--outline ls-btn--sm" href="/bridge/orders">
                House account
              </Link>
              <Link className="ls-btn ls-btn--outline ls-btn--sm" href="/bridge/shoreside">
                Shoreside
              </Link>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={holding}
        onClose={() => setHolding(false)}
        width={420}
        eyebrow={detail ? detail.name : ""}
        title={
          detail?.status === "departed"
            ? "Bring this member back aboard?"
            : detail?.status === "paused"
              ? detail.holdReason === "dues"
                ? "Lift the dues hold now?"
                : "Resume this membership?"
              : "Pause this membership?"
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setHolding(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const row = openRow;
                /* A departed member used to leave the operator only one
                   button, labelled "Pause membership", which wrote `paused` — and
                   then stamped the operator as the one who placed it, so the
                   member could not lift it themselves either. Reinstating
                   somebody required first recording a hold that never happened,
                   and then lifting it. Departed goes straight to active. */
                const next =
                  detail?.status === "departed" || detail?.status === "paused" ? "active" : "paused";
                if (!row) return;
                setHolding(false);
                startTransition(async () => {
                  const res = await setMemberStatus(row.id, next);
                  if (res.error) show({ msg: res.error, tone: "danger" });
                  else {
                    /* A lifted hold has no reason left to show. */
                    setDetail((d) => (d ? { ...d, status: next, holdReason: next === "paused" ? d.holdReason : null } : d));
                    /* The standing landed either way. `note` means the dues did
                       NOT move with it, and the operator is the only person who
                       can put that right — so it replaces the cheerful line
                       rather than appearing beside it. */
                    show(
                      res.note
                        ? {
                            msg: res.note,
                            meta: `${row.name.toUpperCase()} · ${next === "paused" ? "PAUSED" : "ACTIVE"} · DUES UNCHANGED`,
                            tone: "caution",
                          }
                        : {
                            msg: next === "paused" ? "Paused. The member has the word." : "Running again.",
                            meta: `${row.name.toUpperCase()} · ${next === "paused" ? "PAUSED" : "ACTIVE"}`,
                            tone: next === "paused" ? "caution" : "positive",
                          }
                    );
                  }
                });
              }}
            >
              {detail?.status === "paused"
                ? detail.holdReason === "dues"
                  ? "Lift it now"
                  : "Resume it"
                : "Pause it"}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
          {detail?.status === "paused"
            ? detail.holdReason === "dues"
              ? `${DUES_HOLD_NOTE}. Booking, posting and contests open back up, and the member is told.`
              : "Booking, posting and contests open back up, and the member is told."
            : "Their log and ledger stay open; booking, posting and contests stop until it resumes. The member is told, with no guessing."}
        </p>
      </Dialog>

      <Dialog
        open={adjusting}
        onClose={() => setAdjusting(false)}
        width={420}
        eyebrow={detail ? detail.name : ""}
        title="Correct the knots ledger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const row = openRow;
                if (!row) return;
                const delta = Number(knotDelta);
                startTransition(async () => {
                  const res = await adjustKnots(row.id, delta, knotReason);
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setAdjusting(false);
                  setKnotDelta("");
                  setKnotReason("");
                  show({ msg: "Posted to the ledger.", meta: `${row.name.toUpperCase()} · CORRECTED` });
                });
              }}
            >
              Post it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input
            label="Knots"
            type="number"
            hint="Negative claws back. Never zero."
            value={knotDelta}
            onChange={(e) => setKnotDelta(e.target.value)}
          />
          <Input
            label="Reason"
            hint="The member reads this on their ledger."
            value={knotReason}
            onChange={(e) => setKnotReason(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={verifying}
        onClose={() => setVerifying(false)}
        width={420}
        eyebrow={detail ? detail.name : ""}
        title="Mark this number verified?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVerifying(false)}>
              Not yet
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const row = openRow;
                if (!row) return;
                startTransition(async () => {
                  const res = await verifyPhone(row.id);
                  if (res.error) {
                    /* The RPC speaks for itself — 'there is no number on file
                       to verify — the member adds one on their You page first'
                       arrives here as said, refusal and way out together. */
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setVerifying(false);
                  setDetail((d) => (d ? { ...d, phoneVerified: true } : d));
                  show({
                    msg: "Number verified. Weather-hold texts can reach them now.",
                    meta: `${row.name.toUpperCase()} · ${detail?.phone ?? ""}`,
                    tone: "positive",
                  });
                });
              }}
            >
              Mark it verified
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
          {detail?.phone ?? "—"} — verify only a number you have called or seen
          answered. The weather-hold texts ride on it. If the member changes
          their number later, the flag drops on its own and it is verified
          again from here.
        </p>
      </Dialog>

      <Dialog
        open={comping}
        onClose={() => setComping(false)}
        width={420}
        eyebrow={detail ? detail.name : ""}
        title="Complimentary dues."
        footer={
          <>
            <Button variant="ghost" onClick={() => setComping(false)}>
              Not now
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => {
                const row = openRow;
                if (!row) return;
                const until = compUntil.trim() || null;
                const plan = compPlan || null;
                startTransition(async () => {
                  const res = await compDues(row.id, until, plan);
                  if (res.error) {
                    show({ msg: res.error, tone: "danger" });
                    return;
                  }
                  setComping(false);
                  setDetail((d) =>
                    d
                      ? {
                          ...d,
                          compedUntil: until,
                          planId: plan ?? d.planId,
                          planLine: plan ? (plans.find((p) => p.id === plan)?.label ?? d.planLine) : d.planLine,
                        }
                      : d
                  );
                  show({
                    msg: until ? `Complimentary until ${logDate(until, null)}.` : "Comp cleared. Dues run as the plan says.",
                    meta: row.name.toUpperCase(),
                    tone: "positive",
                  });
                });
              }}
            >
              {compUntil.trim() ? "Comp it" : "Clear the comp"}
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            The plan stands and nothing is charged until the date. Blank clears it and dues run again
            from the next period.
          </p>
          <Input
            label="Complimentary until"
            type="date"
            value={compUntil}
            onChange={(e) => setCompUntil(e.target.value)}
          />
          <Select
            label="Plan"
            hint={detail?.planId ? "Already on a plan; change it only if the comp is for a different tier." : "No plan on file — a comp needs one to stand on."}
            value={compPlan}
            onChange={(e) => setCompPlan(e.target.value)}
            options={[{ value: "", label: detail?.planId ? "Keep the plan" : "No plan" }, ...plans.map((p) => ({ value: p.id, label: p.label }))]}
          />
        </div>
      </Dialog>

      {/* — Bulk confirmations. Each names the count in its title. — */}
      <Dialog
        open={bulk === "hold" || bulk === "lift"}
        onClose={() => setBulk(null)}
        width={420}
        eyebrow={`${chosen.length} ${chosen.length === 1 ? "member" : "members"}`}
        title={bulk === "hold" ? `Pause ${chosen.length} ${chosen.length === 1 ? "membership" : "memberships"}?` : `Lift the hold on ${chosen.length}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulk(null)}>
              Not now
            </Button>
            <Button
              variant={bulk === "hold" ? "danger" : "gold"}
              disabled={pending}
              onClick={() => runBulk((ids) => bulkSetStatus(ids, bulk === "hold" ? "paused" : "active"), bulk === "hold" ? "Paused" : "Running again")}
            >
              {bulk === "hold" ? "Pause them" : "Lift it"}
            </Button>
          </>
        }
      >
        <p className="hm-body">
          {bulk === "hold"
            ? "Booking, posting and contests stop for each of them until it resumes, and their dues pause with it. Each member is told."
            : "Booking, posting and contests open back up for each of them, dues resume, and each member is told. Anyone already active is unchanged."}
        </p>
      </Dialog>

      <Dialog
        open={bulk === "knots"}
        onClose={() => setBulk(null)}
        width={420}
        eyebrow={`${chosen.length} ${chosen.length === 1 ? "member" : "members"}`}
        title={`Post the same knots to ${chosen.length}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulk(null)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() => runBulk((ids) => bulkAdjustKnots(ids, Number(bulkDelta), bulkReason), "Posted to the ledger")}
            >
              Post it to {chosen.length}
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input label="Knots" type="number" hint="Negative claws back. Never zero. The same figure lands on every ledger." value={bulkDelta} onChange={(e) => setBulkDelta(e.target.value)} />
          <Input label="Reason" hint="Each member reads this on their ledger." value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
        </div>
      </Dialog>

      <Dialog
        open={bulk === "word"}
        onClose={() => setBulk(null)}
        width={460}
        eyebrow={`${chosen.length} ${chosen.length === 1 ? "member" : "members"}`}
        title={`Send a word to ${chosen.length}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulk(null)}>
              Not yet
            </Button>
            <Button variant="gold" disabled={pending} onClick={() => runBulk((ids) => bulkWord(ids, bulkTitle, bulkBody), "Said")}>
              Say it to {chosen.length}
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <Input label="Title" maxLength={120} placeholder="A word about Saturday." value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} />
          <Textarea label="The word" rows={4} maxLength={600} value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} />
          <p className="hm-note">
            One notice each, in the app. Not a broadcast — nothing goes by email from here, and it
            is not kept on the Broadcast log.
          </p>
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
