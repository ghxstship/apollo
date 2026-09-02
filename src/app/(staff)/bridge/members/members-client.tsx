"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Dialog, Input, Select, Stat, StateBlock, Table, Tag, Toast } from "@/components/ds";
import { CLUB_ZONE, LEAGUES, PLACE, knots } from "@/lib/brand";
import { logDate, logDateTime, price } from "@/lib/format";
import { useToast } from "../../ui";
import {
  adjustKnots,
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
  harborSlug: string;
  harborCode: string;
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
  harbor: "",
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
  [PLACE.market, (r) => r.harborCode],
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
  harbors,
  plans,
  recentCutoff,
}: {
  rows: MemberRow[];
  segments: SegmentOption[];
  harbors: Array<{ slug: string; label: string }>;
  plans: Array<{ id: string; label: string }>;
  recentCutoff: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [f, setF] = React.useState<SegmentFilters>(EMPTY);
  /* Six selects, a search, a checkbox and four buttons stood above the roster
     with no narrow-screen rule at all — about 350px of chrome before row one on
     a phone. Below 900px they fold behind a summary of what is actually set. */
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  /* What the folded bar says it is doing. Reads the filter object rather than a
     second list, so a filter added later cannot be silently left out of the
     summary. */
  const activeFilters = React.useMemo(() => {
    const out: string[] = [];
    if (f.harbor) out.push(harbors.find((h) => h.slug === f.harbor)?.label ?? f.harbor);
    if (f.tier) out.push(f.tier);
    if (f.plan) out.push("Plan set");
    if (f.league) out.push(`League ${f.league}`);
    if (f.status) out.push(f.status);
    if (f.dues) out.push(f.dues);
    if (f.recent) out.push("Sailed in 90 days");
    if (f.q.trim()) out.push(`“${f.q.trim()}”`);
    return out;
  }, [f, harbors]);
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

  const set = <K extends keyof SegmentFilters>(key: K, value: SegmentFilters[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setSegmentId("");
  };

  const filtered = React.useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f.harbor && r.harborSlug !== f.harbor) return false;
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
    { key: "harborCode", label: PLACE.market, width: 80, mono: true },
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
      <div className={"hm-filters" + (filtersOpen ? " is-open" : "")}>
        <div className="hm-filters__summary">
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
            {filtersOpen ? "Hide filters" : "Filter"}
          </Button>
          {activeFilters.length ? (
            activeFilters.map((label) => <Tag key={label}>{label}</Tag>)
          ) : (
            <span className="hm-count">NO FILTER SET</span>
          )}
        </div>
        <div className="hm-filters__body">
        <Select
          label={PLACE.market}
          value={f.harbor}
          onChange={(e) => set("harbor", e.target.value)}
          options={[{ value: "", label: "Every city" }, ...harbors.map((h) => ({ value: h.slug, label: h.label }))]}
        />
        <Select
          label="Tier"
          value={f.tier}
          onChange={(e) => set("tier", e.target.value)}
          options={[
            { value: "", label: "Any tier" },
            { value: "regional", label: "Regional" },
            { value: "national", label: "National" },
            { value: "global", label: "Global" },
          ]}
        />
        <Select
          label="Plan"
          value={f.plan}
          onChange={(e) => set("plan", e.target.value)}
          options={[{ value: "", label: "Any plan" }, ...plans.map((p) => ({ value: p.id, label: p.label }))]}
        />
        <Select
          label="League"
          value={f.league}
          onChange={(e) => set("league", e.target.value)}
          options={[
            { value: "", label: "Any League" },
            ...LEAGUES.map((l) => ({ value: String(l.league), label: l.name })),
          ]}
        />
        <Select
          label="Standing"
          value={f.status}
          onChange={(e) => set("status", e.target.value)}
          options={[{ value: "", label: "Any standing" }, ...STATUS_OPTIONS]}
        />
        <Select
          label="Dues"
          value={f.dues}
          onChange={(e) => set("dues", e.target.value)}
          options={[{ value: "", label: "Any dues state" }, ...DUES_OPTIONS]}
        />
        <Input
          className="hm-filters__grow"
          label="Search"
          placeholder="Name, member no, email"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
        />
        <Checkbox
          label="Sailed in the last 90 days"
          checked={f.recent}
          onChange={(e) => set("recent", e.target.checked)}
        />
        <div className="hm-filters__acts">
          <Select
            label="Saved views"
            value={segmentId}
            onChange={(e) => applySegment(e.target.value)}
            options={[
              { value: "", label: segments.length ? "Load a view" : "None saved yet" },
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
        </div>
        </div>
      </div>

      {/* The count was 10px mono in the faintest token on the sheet — the one
          figure that says whether the filters did anything. */}
      <div className="hm-row">
        <Stat size="sm" label="On the roll" value={filtered.length} sub={`OF ${rows.length}`} />
      </div>

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

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
