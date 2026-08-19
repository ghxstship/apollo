"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Table, Toast } from "@/components/ds";
import { CONTEST_METRIC, knots } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { useToast } from "../../ui";
import {
  createContest,
  openContest,
  settleContest,
  type ContestMetric,
  type ContestShape,
} from "./actions";

export type ContestRow = {
  id: string;
  slug: string;
  title: string;
  shape: ContestShape;
  metric: ContestMetric;
  target: number | null;
  knotsAward: number;
  startsAt: string;
  endsAt: string;
  status: "draft" | "open" | "settled";
  entries: number;
  [key: string]: unknown;
};

const METRICS: ContestMetric[] = ["nm", "sailings", "harbors", "vessels", "crew_met", "frames"];

function statusTone(s: ContestRow["status"]): "laurel" | "clay" | "outline" {
  if (s === "open") return "laurel";
  if (s === "settled") return "outline";
  return "clay";
}

export function RegattasClient({ rows }: { rows: ContestRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [calling, setCalling] = React.useState(false);
  const [confirmSettle, setConfirmSettle] = React.useState<ContestRow | null>(null);

  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [blurb, setBlurb] = React.useState("");
  const [shape, setShape] = React.useState<ContestShape>("regatta");
  const [metric, setMetric] = React.useState<ContestMetric>("nm");
  const [target, setTarget] = React.useState("100");
  const [prize, setPrize] = React.useState("");
  const [award, setAward] = React.useState("500");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");

  const columns = [
    {
      key: "title",
      label: "Contest",
      render: (r: ContestRow) => (
        <span>
          <b style={{ fontWeight: 600 }}>{r.title}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
            /regattas/{r.slug}
          </span>
        </span>
      ),
    },
    {
      key: "shape",
      label: "Shape",
      width: 150,
      render: (r: ContestRow) => (
        <span>
          {r.shape === "regatta" ? "Regatta" : "Challenge"}
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
            {r.shape === "challenge" && r.target
              ? `${r.target} ${CONTEST_METRIC[r.metric] ?? r.metric}`
              : (CONTEST_METRIC[r.metric] ?? r.metric)}
          </span>
        </span>
      ),
    },
    {
      key: "window",
      label: "Window",
      width: 170,
      mono: true,
      render: (r: ContestRow) => `${logDate(r.startsAt)} — ${logDate(r.endsAt)}`,
    },
    { key: "entries", label: "Entered", width: 90, mono: true },
    {
      key: "award",
      label: "Award",
      width: 100,
      mono: true,
      render: (r: ContestRow) => (r.knotsAward > 0 ? knots(r.knotsAward) : "—"),
    },
    {
      key: "status",
      label: "State",
      width: 100,
      render: (r: ContestRow) => (
        <Badge tone={statusTone(r.status)}>
          {r.status === "draft" ? "Draft" : r.status === "open" ? "Open" : "Settled"}
        </Badge>
      ),
    },
    {
      key: "act",
      label: "",
      width: 130,
      render: (r: ContestRow) =>
        r.status === "draft" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await openContest(r.id);
                if (res.error) show({ msg: res.error, tone: "siren" });
                else show({ msg: "Open. Members can enter.", meta: `${r.title.toUpperCase()} · LIVE` });
              })
            }
          >
            Open it
          </Button>
        ) : r.status === "open" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmSettle(r)}>
            Settle
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <div style={{ margin: "22px 0 14px", display: "flex", gap: 10 }}>
        <Button variant="brass" onClick={() => setCalling(true)}>
          Call a contest
        </Button>
      </div>

      {rows.length === 0 ? (
        <StateBlock
          title="Nothing called."
          detail="A regatta ranks its entrants; a challenge asks for a number. Both close on a date and then become history."
        />
      ) : (
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      <Dialog
        open={calling}
        onClose={() => setCalling(false)}
        title="Call a contest"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCalling(false)}>
              Cancel
            </Button>
            <Button
              variant="brass"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createContest({
                    title,
                    slug,
                    blurb,
                    shape,
                    metric,
                    target: Number(target) || 0,
                    prize,
                    knotsAward: Number(award) || 0,
                    startsAt,
                    endsAt,
                  });
                  if (res.error) {
                    show({ msg: res.error, tone: "siren" });
                    return;
                  }
                  setCalling(false);
                  setTitle("");
                  setSlug("");
                  setBlurb("");
                  setPrize("");
                  show({ msg: "Called.", meta: "DRAFT · OPEN IT WHEN READY" });
                })
              }
            >
              Call it
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Input label="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            label="Address"
            hint="Left blank, it comes from the name."
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Input label="Blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          <Select
            label="Shape"
            value={shape}
            onChange={(e) => setShape(e.target.value as ContestShape)}
          >
            <option value="regatta">Regatta — ranked</option>
            <option value="challenge">Challenge — reach a number</option>
          </Select>
          <Select
            label="Measured by"
            value={metric}
            onChange={(e) => setMetric(e.target.value as ContestMetric)}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {CONTEST_METRIC[m] ?? m}
              </option>
            ))}
          </Select>
          {shape === "challenge" ? (
            <Input
              label="Target"
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          ) : null}
          <Input
            label="Prize"
            hint="Read out in the result. Optional."
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
          />
          <Input
            label="Knots to the winner"
            type="number"
            value={award}
            onChange={(e) => setAward(e.target.value)}
          />
          <Input
            label="Opens"
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Closes"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(confirmSettle)}
        onClose={() => setConfirmSettle(null)}
        title="Settle it?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSettle(null)}>
              Not yet
            </Button>
            <Button
              variant="brass"
              disabled={pending}
              onClick={() => {
                const target = confirmSettle;
                if (!target) return;
                startTransition(async () => {
                  const res = await settleContest(target.id);
                  setConfirmSettle(null);
                  if (res.error) show({ msg: res.error, tone: "siren" });
                  else show({ msg: "Settled.", meta: `${target.title.toUpperCase()} · RESULT POSTED` });
                });
              }}
            >
              Settle
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
          The standing freezes exactly as it reads now, the award posts, and everyone
          who entered is notified. This cannot be undone — a settled result is the
          record.
        </p>
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
