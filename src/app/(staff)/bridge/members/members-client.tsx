"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Checkbox, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
import { CLUB_ZONE, LEAGUES, knots } from "@/lib/brand";
import { logDate, logDateTime, price } from "@/lib/format";
import { useToast } from "../../ui";
import {
  adjustKnots,
  loadMember,
  removeSegment,
  saveSegment,
  setMemberStatus,
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

const CSV_COLUMNS: Array<[string, (r: MemberRow) => string]> = [
  ["Member", (r) => r.name],
  ["Member no", (r) => r.memberNo],
  ["Email", (r) => r.email],
  ["Tier", (r) => r.tierLabel],
  ["Plan", (r) => r.planLabel],
  ["League", (r) => r.leagueName],
  ["Harbor", (r) => r.harborCode],
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
  const [segmentId, setSegmentId] = React.useState("");
  const [naming, setNaming] = React.useState(false);
  const [segmentName, setSegmentName] = React.useState("");
  const [openRow, setOpenRow] = React.useState<MemberRow | null>(null);
  const [detail, setDetail] = React.useState<MemberDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);
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
    a.download = `syrius-members-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <b style={{ fontWeight: 600 }}>{r.name}</b>
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
    { key: "harborCode", label: "Harbor", width: 80, mono: true },
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
      <div className="hm-filters">
        <Select
          label="Harbor"
          value={f.harbor}
          onChange={(e) => set("harbor", e.target.value)}
          options={[{ value: "", label: "Every harbor" }, ...harbors.map((h) => ({ value: h.slug, label: h.label }))]}
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

      <span className="hm-count">
        {filtered.length} OF {rows.length} ON THE ROLL
      </span>

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
          <p style={{ fontSize: 13 }}>
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
              <span className="hm-mono">CONTACT</span>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                {detail.email} · {detail.phone}
                <br />
                {detail.handle} · joined {logDate(detail.joined, CLUB_ZONE)}
              </p>
            </div>
            <div>
              <span className="hm-mono">PLAN AND DUES</span>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                {detail.planLine} — {detail.duesLine}
                <br />
                House account: {detail.balanceCents ? price(Math.abs(detail.balanceCents)) : "Complimentary"}
                {detail.balanceCents < 0 ? " owing" : " on hand"}
              </p>
            </div>
            <div>
              <span className="hm-mono">KNOTS — {knots(detail.knotsBalance).toUpperCase()} ON THE LEDGER</span>
              {detail.knotsRecent.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 13 }}>
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
                <p style={{ fontSize: 13, marginTop: 4 }}>Nothing banked yet.</p>
              )}
            </div>
            <div>
              <span className="hm-mono">RECENT PASSES</span>
              {detail.passes.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 13 }}>
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
                <p style={{ fontSize: 13, marginTop: 4 }}>No passes on the record.</p>
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
                    ? "Resume membership"
                    : "Pause membership"}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setAdjusting(true)}>
                Correct knots
              </Button>
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
              ? "Resume this membership?"
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
                    setDetail((d) => (d ? { ...d, status: next } : d));
                    show({
                      msg: next === "paused" ? "Paused. The member has the word." : "Running again.",
                      meta: `${row.name.toUpperCase()} · ${next === "paused" ? "PAUSED" : "ACTIVE"}`,
                      tone: next === "paused" ? "caution" : "positive",
                    });
                  }
                });
              }}
            >
              {detail?.status === "paused" ? "Resume it" : "Pause it"}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          {detail?.status === "paused"
            ? "Booking, posting and contests open back up, and the member is told."
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

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
