"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Stat, StateBlock } from "@/components/ds";
import { logTime } from "@/lib/format";
import { gangwayCheckIn, gangwayFlush } from "./actions";
import { CameraScanner } from "./camera-scanner";

export type GangwayRow = {
  rsvpId: string;
  code: string;
  name: string;
  memberNo: string;
  vessel: string;
  guestNames: string[];
  guests: number;
  waiverSigned: boolean;
  checkedInAt: string | null;
};

type Scan = {
  kind: "aboard" | "already" | "not_found";
  name?: string;
  memberNo?: string;
  /* A guest stub scanned at the door — whose guest it is. */
  guestOf?: string;
  vessel?: string;
  guestNames?: string[];
  time?: string;
  otherVoyage?: string;
  queued?: boolean;
};

type QueueItem = { rsvpId: string; voyageId: string; code: string; at: string };

const QUEUE_KEY = "syrius-gangway-queue";
const ROSTER_KEY = "syrius-gangway-roster:";

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked — the optimistic marks still hold on screen */
  }
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function GangwayConsole({
  voyageId,
  voyageTitle,
  family,
  departs,
  options,
  rows: serverRows,
}: {
  voyageId: string;
  voyageTitle: string;
  family: string;
  departs: string;
  options: Array<{ value: string; label: string }>;
  rows: GangwayRow[];
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [code, setCode] = React.useState("");
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [pending, setPending] = React.useState(false);
  const [queued, setQueued] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const [rows, setRows] = React.useState<GangwayRow[]>(serverRows);
  const flushing = React.useRef(false);

  /* Server data wins on every load; queued marks re-apply on top. The sync
     runs on the next frame — localStorage is the external system here. */
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      const q = readQueue();
      setQueued(q.length);
      const marks = new Map(q.map((item) => [item.rsvpId, item.at]));
      setRows(
        serverRows.map((r) =>
          !r.checkedInAt && marks.has(r.rsvpId) ? { ...r, checkedInAt: marks.get(r.rsvpId)! } : r
        )
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [serverRows]);

  /* Cache the roster so the gangway keeps working past the breakwater. */
  React.useEffect(() => {
    try {
      localStorage.setItem(ROSTER_KEY + voyageId, JSON.stringify(serverRows));
    } catch {
      /* cache is best-effort */
    }
  }, [voyageId, serverRows]);

  const flush = React.useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q = readQueue();
      for (const item of [...q]) {
        try {
          const res = await gangwayFlush(item.rsvpId, item.at);
          if (!res.error) {
            q = q.filter((x) => x.rsvpId !== item.rsvpId);
            writeQueue(q);
            setQueued(q.length);
          }
        } catch {
          break; /* still offline — try again on the next signal */
        }
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (navigator.onLine) void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  const markRow = (rsvpId: string, at: string) =>
    setRows((prev) => prev.map((r) => (r.rsvpId === rsvpId ? { ...r, checkedInAt: at } : r)));

  /* Offline path — resolve against the cached roster and queue the stamp. */
  const localScan = (raw: string): Scan => {
    const needle = raw.toLowerCase();
    let pool = rows;
    try {
      const cached = localStorage.getItem(ROSTER_KEY + voyageId);
      if (cached) {
        const parsed = JSON.parse(cached) as GangwayRow[];
        if (Array.isArray(parsed) && parsed.length) {
          const marks = new Map(rows.map((r) => [r.rsvpId, r.checkedInAt]));
          pool = parsed.map((r) => ({ ...r, checkedInAt: marks.get(r.rsvpId) ?? r.checkedInAt }));
        }
      }
    } catch {
      /* fall back to in-memory rows */
    }
    const hit = pool.find((r) => r.code && r.code.toLowerCase() === needle);
    if (!hit) return { kind: "not_found", queued: true };
    const base = {
      name: hit.name,
      memberNo: hit.memberNo,
      vessel: hit.vessel || undefined,
      guestNames: hit.guestNames,
    };
    if (hit.checkedInAt) return { kind: "already", ...base, time: hit.checkedInAt, queued: true };
    const at = new Date().toISOString();
    const q = readQueue().filter((x) => x.rsvpId !== hit.rsvpId);
    q.push({ rsvpId: hit.rsvpId, voyageId, code: hit.code, at });
    writeQueue(q);
    setQueued(q.length);
    markRow(hit.rsvpId, at);
    return { kind: "aboard", ...base, time: at, queued: true };
  };

  const submit = async (value?: string) => {
    if (pending) return;
    const raw = (value ?? code).trim();
    setCode("");
    if (!raw) return;
    setPending(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setScan(localScan(raw));
      } else {
        try {
          const res = await gangwayCheckIn(raw, voyageId);
          if (res.error) {
            setScan({ kind: "not_found" });
          } else if (res.outcome === "not_found") {
            setScan({ kind: "not_found" });
          } else {
            const s: Scan = {
              kind: res.outcome!,
              name: res.name,
              memberNo: res.memberNo,
              vessel: res.vessel,
              guestNames: res.guestNames,
              guestOf: res.guestOf,
              time: res.checkedInAt,
              otherVoyage: res.otherVoyage,
            };
            setScan(s);
            if (res.outcome === "aboard" && !res.otherVoyage) {
              const hit = rows.find((r) => r.code.toLowerCase() === raw.toLowerCase());
              if (hit) markRow(hit.rsvpId, res.checkedInAt ?? new Date().toISOString());
            }
          }
        } catch {
          /* the action never reached shore — work from the cached roster */
          setScan(localScan(raw));
        }
      }
    } finally {
      setPending(false);
      /* the scanner fires again in seconds — the field takes the next read */
      requestAnimationFrame(() => formRef.current?.querySelector("input")?.focus());
    }
  };

  const checked = rows.filter((r) => r.checkedInAt).length;

  const downloadCsv = () => {
    const header = ["Name", "Member no", "Code", "Vessel", "Guests", "Waiver"];
    const lines = [
      header,
      ...rows.map((r) => [
        r.name,
        r.memberNo,
        r.code || "—",
        r.vessel || "—",
        r.guestNames.length ? r.guestNames.join("; ") : r.guests ? String(r.guests) : "—",
        r.waiverSigned ? "Signed" : "Missing",
      ]),
    ];
    const csv = lines.map((cols) => cols.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gangway-list-${voyageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const guestsLine = (s: Scan) =>
    s.guestNames && s.guestNames.length
      ? `+${s.guestNames.length} ${s.guestNames.length === 1 ? "guest" : "guests"}: ${s.guestNames.join(", ")}`
      : null;

  return (
    <>
      {/* Event state in the data register — family first, count ticks live. */}
      <div className="ls-mono-data hm-gang__meta">
        {family.toUpperCase()} · {voyageTitle.replace(/\.+$/, "").toUpperCase()} · {departs} · {checked}/{rows.length} ABOARD
      </div>
      <div className="hm-sec" style={{ marginTop: 20 }}>
        <Select
          label="Voyage"
          options={options}
          value={voyageId}
          onChange={(e) => router.replace(`/bridge/gangway?voyage=${e.target.value}`)}
          style={{ maxWidth: 420 }}
        />
      </div>

      <div className="hm-gang__scan">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            label="Boarding code"
            placeholder="Scan or type the code"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="hm-gang__input"
          />
        </form>
        <CameraScanner onScan={(scanned) => void submit(scanned)} />

        {scan ? (
          <div
            className={`hm-gang__result hm-gang__result--${scan.kind}`}
            role="status"
            aria-live="polite"
          >
            {scan.kind === "aboard" ? (
              <>
                <b>
                  ABOARD — {(scan.name ?? "").toUpperCase()} · {scan.memberNo}
                  {scan.guestOf ? ` · GUEST OF ${scan.guestOf.toUpperCase()}` : ""}
                  {scan.vessel ? ` · ${scan.vessel.toUpperCase()}` : ""}
                </b>
                {guestsLine(scan) ? <span>{guestsLine(scan)}</span> : null}
                {scan.otherVoyage ? (
                  <span>On another manifest — checked in for {scan.otherVoyage}.</span>
                ) : null}
              </>
            ) : scan.kind === "already" ? (
              <>
                <b>ALREADY CHECKED IN {scan.time ? logTime(scan.time) : ""}</b>
                <span>
                  {scan.name} · {scan.memberNo}
                  {scan.guestOf ? ` · guest of ${scan.guestOf}` : ""}
                  {scan.vessel ? ` · ${scan.vessel}` : ""}
                </span>
                {guestsLine(scan) ? <span>{guestsLine(scan)}</span> : null}
              </>
            ) : (
              <>
                <b>NOT ON THIS MANIFEST</b>
                <span>No pass matches that code on this voyage.</span>
              </>
            )}
          </div>
        ) : null}

        {queued > 0 ? (
          <StateBlock
            bare
            status="offline"
            title="Stamps queued at the gangway."
            detail={`${queued} check-in${queued === 1 ? "" : "s"} waiting to sync. They flush on their own when the signal returns.`}
          />
        ) : null}
      </div>

      <div className="hm-row">
        <Stat size="sm" label="Checked in" value={`${checked} / ${rows.length}`} sub={departs.toUpperCase()} />
      </div>

      <section className="hm-sec">
        <div className="hm-head">
          <h2>The gangway list.</h2>
          <span className="hm-acts">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print the gangway list
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadCsv}>
              Download CSV
            </Button>
          </span>
        </div>
        <p className="hm-note">
          Name, member number, code, vessel, guests by name, and waiver status — the paper fallback
          for a dead battery.
        </p>
      </section>

      {mounted
        ? createPortal(
            <div className="hm-doorlist" aria-hidden="true">
              <h1>Door list — {voyageTitle}</h1>
              <p>{departs} · {rows.length} passes · printed {logTime(new Date().toISOString())}</p>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Member no</th>
                    <th>Code</th>
                    <th>Vessel</th>
                    <th>Guests</th>
                    <th>Waiver</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rsvpId}>
                      <td>{r.name}</td>
                      <td>{r.memberNo}</td>
                      <td>{r.code || "—"}</td>
                      <td>{r.vessel || "—"}</td>
                      <td>
                        {r.guestNames.length
                          ? r.guestNames.join(", ")
                          : r.guests
                            ? String(r.guests)
                            : "—"}
                      </td>
                      <td>{r.waiverSigned ? "Signed" : "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
