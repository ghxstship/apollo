"use client";

import React from "react";
import { Badge, Button, Dialog, ListToolbar, StateBlock, Table, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { cutAnchorsShort, openTheRadar } from "./actions";

/* One row per episode, with the state of its clock. The times are formatted on
   the server against the EPISODE'S zone and arrive here as strings — a client
   that reformatted them would render the lock on the operator's clock, which is
   the one number on this screen that must never be the operator's. */

export type RadarOpsRow = {
  id: string;
  title: string;
  departs: string;
  status: string;
  aboard: number;
  /** Null when the radar has never been opened on this episode. */
  opens: string | null;
  locks: string | null;
  unlocks: string | null;
  expires: string | null;
  slots: number | null;
  phase: "unopened" | "before" | "open" | "locked" | "unlocked" | "expired";
  settled: boolean;
  anchors: number;
  [key: string]: unknown;
};

const PHASE_LABEL: Record<RadarOpsRow["phase"], string> = {
  unopened: "Dark",
  before: "Set",
  open: "Sweeping",
  locked: "Locked",
  unlocked: "Log open",
  expired: "Gone",
};

function phaseTone(p: RadarOpsRow["phase"]): "gold" | "positive" | "caution" | "outline" {
  if (p === "open") return "positive";
  if (p === "locked" || p === "unlocked") return "gold";
  if (p === "unopened") return "outline";
  return "caution";
}

export function RadarClient({ rows }: { rows: RadarOpsRow[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  /* Re-reading a clock that is already set moves a lock members have been told
     about, so it asks first. The first open does not — there is nothing yet to
     disagree with. */
  const [confirmReopen, setConfirmReopen] = React.useState<RadarOpsRow | null>(null);
  /* Cutting the logs short is the one irreversible act on this screen, so it
     always asks first. */
  const [confirmCut, setConfirmCut] = React.useState<RadarOpsRow | null>(null);

  const cut = (row: RadarOpsRow) =>
    startTransition(async () => {
      const res = await cutAnchorsShort(row.id);
      setConfirmCut(null);
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      /* The count comes back from the write itself, never from the props this
         screen was rendered with — a second operator pressing the same button
         is told the truth, which is that nothing was left to cut. */
      show(
        res.cut
          ? {
              msg: "Cut short. The contacts are gone on both sides.",
              meta: `${row.title.replace(/\.+$/, "").toUpperCase()} · ${res.cut} ${res.cut === 1 ? "ANCHOR" : "ANCHORS"} ENDED`,
              tone: "caution",
            }
          : {
              msg: "Nothing was live to cut — every anchor on this episode had already expired.",
              meta: row.title.replace(/\.+$/, "").toUpperCase(),
            }
      );
    });

  const run = (row: RadarOpsRow, said: string) =>
    startTransition(async () => {
      const res = await openTheRadar(row.id);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: said, meta: row.title.replace(/\.+$/, "").toUpperCase() });
      setConfirmReopen(null);
    });

  const columns = [
    {
      key: "title",
      label: "Episode",
      render: (r: RadarOpsRow) => (
        <span>
          <b style={{ fontWeight: 700 }}>{r.title.replace(/\.+$/, "")}</b>
          <span style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>{r.departs}</span>
        </span>
      ),
    },
    {
      key: "phase",
      label: "Radar",
      width: 120,
      render: (r: RadarOpsRow) => <Badge tone={phaseTone(r.phase)}>{PHASE_LABEL[r.phase]}</Badge>,
    },
    {
      key: "clock",
      label: "The clock",
      width: 260,
      /* Four times read on the episode's own zone — the data register, declared
         on the column rather than patched on with .hm-mono inside each cell. */
      mono: true,
      render: (r: RadarOpsRow) =>
        r.opens ? (
          <span style={{ display: "block", lineHeight: 1.7 }}>
            OPENS {r.opens} · LOCKS {r.locks}
            <span style={{ display: "block" }}>
              LOG {r.unlocks} · GONE {r.expires}
            </span>
          </span>
        ) : (
          "NEVER OPENED"
        ),
    },
    {
      key: "aboard",
      label: "Aboard",
      width: 80,
      mono: true,
      render: (r: RadarOpsRow) => String(r.aboard),
    },
    {
      key: "anchors",
      label: "Anchors",
      width: 90,
      mono: true,
      render: (r: RadarOpsRow) => (r.opens ? String(r.anchors) : "—"),
    },
    {
      key: "settled",
      label: "Guarantee",
      width: 120,
      /* Three states, and two of them were plain mono text sitting either side
         of a badge — the one column an operator scans for whether the club owes
         a guarantee, told in two different registers. */
      render: (r: RadarOpsRow) =>
        !r.opens ? (
          <Badge tone="outline">Unreachable</Badge>
        ) : r.settled ? (
          <Badge tone="positive">Settled</Badge>
        ) : (
          <Badge tone="caution">On docking</Badge>
        ),
    },
    {
      key: "act",
      label: "",
      width: 150,
      render: (r: RadarOpsRow) =>
        r.opens ? (
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "start" }}>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmReopen(r)}
            >
              Re-read the clock
            </Button>
            {/* The one irreversible act on this screen, and it was a ghost
                button directly under Re-read the clock, which is not. */}
            {r.anchors > 0 ? (
              <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmCut(r)}>
                Cut the logs short
              </Button>
            ) : null}
          </span>
        ) : (
          <Button
            size="sm"
            variant="gold"
            disabled={pending}
            onClick={() => run(r, "Radar is set. It opens at 17:15 on the episode's own clock.")}
          >
            Open the radar
          </Button>
        ),
    },
  ];

  return (
    <>
      {rows.length === 0 ? (
        <StateBlock
          status="empty"
          icon="Radar"
          title="Nothing to sweep."
          detail="Radar runs on an episode. Put one on the board from the Episodes tab and it shows here, dark, waiting to be set."
        />
      ) : (
        <div className="hm-sec">
          <ListToolbar
            resultCount={rows.length}
            resultNoun="episode"
            countSuffix={` · ${rows.filter((r) => r.opens).length} carry a radar clock`}
          />
          <Table columns={columns} rows={rows} rowKey={(r) => r.id} />
        </div>
      )}

      <Dialog
        open={!!confirmReopen}
        onClose={() => setConfirmReopen(null)}
        eyebrow="Re-read the clock"
        title="Move a lock members have been told about?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReopen(null)}>
              Leave it
            </Button>
            <Button
              variant="gold"
              disabled={pending}
              onClick={() =>
                confirmReopen && run(confirmReopen, "Clock re-read off the episode's departure.")
              }
            >
              Re-read it
            </Button>
          </>
        }
      >
        <p className="hm-body">
          The four times are read off the episode&apos;s departure date and its
          city&apos;s zone. If the departure moved, this brings the clock with
          it. If it did not, nothing changes.
        </p>
        <p className="hm-body">
          Picks already plotted and anchors already made are untouched, and a
          guarantee already settled stays settled.
        </p>
      </Dialog>

      <Dialog
        open={!!confirmCut}
        onClose={() => setConfirmCut(null)}
        eyebrow="Cut the logs short"
        title="End every open Captain's Log on this episode?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCut(null)}>
              Leave them
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => confirmCut && cut(confirmCut)}>
              Cut them short
            </Button>
          </>
        }
      >
        <p className="hm-body">
          Ends the open Captain&apos;s Logs for this episode now — cannot be
          undone, cannot be extended back. Every live anchor expires at once, on
          both sides, with no notice sent.
        </p>
        <p className="hm-body">
          This is a blind cut. The crew are never shown who is anchored to whom,
          so there is no way to end one contact and keep another — it is all of
          them or none.
        </p>
      </Dialog>

      {toast ? <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} /> : null}
    </>
  );
}
