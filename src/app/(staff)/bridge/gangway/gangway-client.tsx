"use client";

import React from "react";
import { literalCode } from "@/lib/boarding-code";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Stat, StateBlock } from "@/components/ds";
import { logTime } from "@/lib/format";
import { GANGWAY_QUEUE_KEY, GANGWAY_ROSTER_PREFIX } from "@/lib/device-storage";
import { gangwayCheckIn, gangwayFlush } from "./actions";
import { CameraScanner } from "./camera-scanner";

export type GangwayRow = {
  rsvpId: string;
  code: string;
  name: string;
  memberNo: string;
  vessel: string;
  guestNames: string[];
  /* Per-guest aboard state from rsvp_guests.checked_in_at — the evacuation
     list is read from this, so a guest who scanned their own stub must print
     as aboard, not as an undifferentiated name on the host's row. Optional so
     a roster cached before this field existed still parses. */
  guestList?: { name: string; aboard: boolean }[];
  guests: number;
  waiverSigned: boolean;
  checkedInAt: string | null;
  /* What the pass holds on the episode beyond a place aboard: a daybed claim,
     a cabin and that cabin's own muster station. Optional for the same reason
     guestList is — a roster cached before these existed still parses. */
  daybed?: boolean;
  cabin?: string | null;
  cabinMuster?: string | null;
};

/* One rendering of a guest set, everywhere the roster speaks: aboard guests
   marked, ashore guests plain, so the list and the paper never disagree. */
function guestLine(r: GangwayRow): string {
  if (r.guestList && r.guestList.length) {
    return r.guestList.map((g) => `${g.name} · ${g.aboard ? "ABOARD" : "ashore"}`).join("; ");
  }
  return r.guestNames.length ? r.guestNames.join("; ") : r.guests ? String(r.guests) : "—";
}

/* Same rule for what the pass holds — cabin with its muster, then the daybed
   marker — so the screen, the CSV and the paper all say it one way. */
function berthLine(r: GangwayRow): string {
  const parts: string[] = [];
  if (r.cabin) parts.push(r.cabinMuster ? `${r.cabin} · muster ${r.cabinMuster}` : r.cabin);
  if (r.daybed) parts.push("DAYBED");
  return parts.length ? parts.join(" · ") : "—";
}

type Scan = {
  /* "refused" is a pass that exists and may not board — an outstanding waiver,
     most often. It used to be reported as not_found, so the operator on the
     dock read "NOT ON THIS MANIFEST" for somebody standing in front of them
     holding a real pass, and had no idea what to do about it. */
  /* "unsure" is the one the dock most needed and did not have: the cached
     roster has no match, and the cached roster CANNOT ANSWER for at least four
     legitimate passes — a guest stub (guest codes live in rsvp_guests and are
     only resolvable server-side), a pass for a different episode (online the
     action falls back across upcoming episodes and even names one that has
     already gone), anyone whose RSVP is not `aboard` (the roster filters on
     that; the action does not), and anyone who booked since the cache. Saying
     "NOT ON THIS MANIFEST" to those people tells someone holding a real pass
     that their pass is fake, on the strength of a lookup that never happened. */
  kind: "aboard" | "already" | "not_found" | "refused" | "unsure";
  reason?: string;
  name?: string;
  memberNo?: string;
  /* A guest stub scanned at the door — whose guest it is. */
  guestOf?: string;
  vessel?: string;
  guestNames?: string[];
  /* berthLine() of the roster row the scan resolved to, when it is on this
     roster — a daybed holder is told where to go at the door, not after. */
  berth?: string;
  time?: string;
  otherVoyage?: string;
  queued?: boolean;
};

type QueueItem = {
  rsvpId: string;
  voyageId: string;
  code: string;
  at: string;
  /* How many times the database has refused this for a reason we could not
     read. It stays queued regardless — this only decides when to say so. */
  tries?: number;
};

const QUEUE_KEY = GANGWAY_QUEUE_KEY;
const ROSTER_KEY = GANGWAY_ROSTER_PREFIX;

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

/* EVERY change to the queue goes through here, and nothing else writes it.
   The flush loop used to take one snapshot of the queue and then write that
   snapshot back after each await — so any stamp the crew queued DURING the
   flush was erased by the next iteration. That is the exact marina-wifi shape:
   signal flickers back, `online` fires, flush starts, the crew keeps scanning,
   those scans fall to the offline path, and the flush wipes them on its way
   out. Reproduced end to end: a member showed ABOARD on screen, the queue
   emptied, and her checked_in_at was still null — she walked aboard and the
   manifest, which is the evacuation list, said she was ashore.

   Read-modify-write against storage, so a concurrent addition survives. */
function mutateQueue(fn: (items: QueueItem[]) => QueueItem[]): QueueItem[] {
  const next = fn(readQueue());
  writeQueue(next);
  return next;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function GangwayConsole({
  voyageId,
  voyageTitle,
  identity,
  departs,
  timeZone,
  muster,
  options,
  rows: serverRows,
}: {
  voyageId: string;
  voyageTitle: string;
  /* What this episode is, as a member reads it: the series' own name, or
     where it happens when it belongs to no series. It replaced the class-family
     label, which named a filing system the club no longer speaks in. */
  identity: string;
  departs: string;
  /* The episode's own clock. A boarding stamp read on the render host's zone
     is a stamp on nobody's clock — and this screen is the audit record for who
     walked aboard and when. */
  timeZone: string | null;
  /* Where the door musters — the venue and its address on a shore night, the
     slip the episode names otherwise. Printed on the door list's header. */
  muster: string | null;
  options: Array<{ value: string; label: string }>;
  rows: GangwayRow[];
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [code, setCode] = React.useState("");
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [pending, setPending] = React.useState(false);
  const [queued, setQueued] = React.useState(0);
  /* Stamps the database refused when the signal came back. They must not sit
     in the queue being retried forever under a "waiting to sync" line. */
  const [rejected, setRejected] = React.useState<Array<{ code: string; reason: string }>>([]);
  /* Still queued, still trying, but not landing — the operator should know
     rather than read "waiting to sync" indefinitely. */
  const [stuck, setStuck] = React.useState<Array<{ code: string; reason: string }>>([]);
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
      /* Iterate over the ids present when we started, but never write a stale
         list back: each branch below re-reads the queue through mutateQueue. */
      const startingIds = readQueue().map((x) => x.rsvpId);
      for (const rsvpId of startingIds) {
        const item = readQueue().find((x) => x.rsvpId === rsvpId);
        if (!item) continue; /* dropped by another pass */
        try {
          const res = await gangwayFlush(item.rsvpId, item.at);
          if (!res.error) {
            setQueued(mutateQueue((q) => q.filter((x) => x.rsvpId !== rsvpId)).length);
          } else if (res.final) {
            /* A refusal that will not change on a retry: they have not signed,
               or the pass was already boarded on another device. Drop it and
               say so — retrying forever told the operator only that something
               was "waiting to sync". */
            setQueued(mutateQueue((q) => q.filter((x) => x.rsvpId !== rsvpId)).length);
            setRejected((prev) => [...prev, { code: item.code, reason: res.error! }]);
          } else {
            /* Anything else is indeterminate — a staff session that blinked, a
               database error we cannot read. The stamp STAYS: it is the only
               record that this person walked aboard, and discarding it puts
               them on the manifest as ashore, which is what an evacuation list
               is read from. Count the attempts and surface it after a few, so
               the operator learns about it without it being thrown away. */
            const q = mutateQueue((items) =>
              items.map((x) => (x.rsvpId === rsvpId ? { ...x, tries: (x.tries ?? 0) + 1 } : x))
            );
            const tries = q.find((x) => x.rsvpId === rsvpId)?.tries ?? 0;
            if (tries >= 3) {
              setStuck((prev) =>
                prev.some((s) => s.code === item.code)
                  ? prev
                  : [...prev, { code: item.code, reason: res.error! }]
              );
            }
          }
        } catch {
          break; /* still offline — try again on the next signal */
        }
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  /* Mount and the `online` event were the only two triggers, and marina wifi
     that stays associated while the uplink is dead never fires `online` — so
     queued stamps sat until somebody reloaded the page, on that same phone,
     in that same browser profile. A phone waking from sleep does not fire it
     either. Three more ways in, all cheap: the tab becoming visible again, a
     slow heartbeat, and the page being hidden (the last chance to land a stamp
     before iOS discards the tab). */
  React.useEffect(() => {
    if (navigator.onLine) void flush();
    const go = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") go();
    };
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(() => {
      if (navigator.onLine && readQueue().length > 0) go();
    }, 60_000);
    return () => {
      window.removeEventListener("online", go);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [flush]);

  const markRow = (rsvpId: string, at: string) =>
    setRows((prev) => prev.map((r) => (r.rsvpId === rsvpId ? { ...r, checkedInAt: at } : r)));

  /* Offline path — resolve against the cached roster and queue the stamp. */
  const localScan = (raw: string): Scan => {
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
    /* Map before comparing. A card printed SYR- must find its UN- row here
         too — this is the path that runs past the breakwater, and it is the one
         branch that queues nothing when it misses. */
      const scanned = literalCode(raw);
      const hit = pool.find((r) => r.code && literalCode(r.code) === scanned);
    if (!hit) return { kind: "unsure", queued: true };
    const held = berthLine(hit);
    const base = {
      name: hit.name,
      memberNo: hit.memberNo,
      vessel: hit.vessel || undefined,
      guestNames: hit.guestNames,
      berth: held === "—" ? undefined : held,
    };
    if (hit.checkedInAt) return { kind: "already", ...base, time: hit.checkedInAt, queued: true };
    /* The roster we are scanning against carries waiverSigned, and this path
       never looked at it — so with no signal an unsigned member read ABOARD,
       walked on, and the queued stamp was refused by the database on every
       flush attempt for the rest of the day without anyone being told. Nobody
       boards unsigned, signal or no signal. */
    if (!hit.waiverSigned) {
      return {
        kind: "refused",
        ...base,
        reason:
          "Waiver and release is outstanding — they sign before they board. No signal to check it against, so this one waits.",
        queued: true,
      };
    }
    const at = new Date().toISOString();
    const q = readQueue().filter((x) => x.rsvpId !== hit.rsvpId);
    q.push({ rsvpId: hit.rsvpId, voyageId, code: hit.code, at });
    writeQueue(q);
    setQueued(q.length);
    markRow(hit.rsvpId, at);
    return { kind: "aboard", ...base, time: at, queued: true };
  };

  const submit = async (value?: string) => {
    /* The field was cleared AFTER this guard, so a scan arriving mid-request
       was swallowed with the code still sitting in the input — and the next
       hardware-scanner read concatenated onto it and produced a garbage code.
       Clear first: a dropped scan should cost the crew a re-present, not a
       corrupted one. */
    const raw = (value ?? code).trim();
    setCode("");
    if (pending || !raw) return;
    setPending(true);
    /* `pending` was set and never rendered anywhere. With a slow request the
       screen kept showing the PREVIOUS person's verdict — a confident green
       ABOARD belonging to somebody else — while the crew waved the next person
       through on it. The old verdict goes as soon as a new scan starts. */
    setScan(null);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setScan(localScan(raw));
      } else {
        try {
          const res = await gangwayCheckIn(raw, voyageId);
          if (res.error) {
            /* boardingError() already turned this into something the skipper
               can act on — "…is outstanding — send them the link to sign, then
               scan again." Throwing it away was the whole reason that helper
               existed. */
            setScan({ kind: "refused", reason: res.error });
          } else if (res.outcome === "not_found") {
            setScan({ kind: "not_found" });
          } else {
            /* Same mapping as the action that just succeeded, or a legacy card
               scans green while its roster row stays ashore and the counter
               does not move. */
            const hit = rows.find((r) => literalCode(r.code) === literalCode(raw));
            const held = hit ? berthLine(hit) : "—";
            const s: Scan = {
              kind: res.outcome!,
              name: res.name,
              memberNo: res.memberNo,
              vessel: res.vessel,
              guestNames: res.guestNames,
              guestOf: res.guestOf,
              berth: hit && !res.otherVoyage && held !== "—" ? held : undefined,
              time: res.checkedInAt,
              otherVoyage: res.otherVoyage,
            };
            setScan(s);
            if (res.outcome === "aboard" && !res.otherVoyage && hit) {
              markRow(hit.rsvpId, res.checkedInAt ?? new Date().toISOString());
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
    const header = ["Name", "Member no", "Code", "Vessel", "Holds", "Guests", "Waiver"];
    const lines = [
      header,
      ...rows.map((r) => [
        r.name,
        r.memberNo,
        r.code || "—",
        r.vessel || "—",
        berthLine(r),
        guestLine(r),
        r.waiverSigned ? "Signed" : "Missing",
      ]),
    ];
    if (muster) lines.push([], ["Muster", muster]);
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
      {/* Episode state in the data register — identity first, count ticks live. */}
      <div className="ls-mono-data hm-gang__meta">
        {identity.toUpperCase()} · {voyageTitle.replace(/\.+$/, "").toUpperCase()} · {departs} · {checked}/{rows.length} ABOARD
      </div>
      <div className="hm-sec" style={{ marginTop: 20 }}>
        <Select
          label="Episode"
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

        {pending ? (
          <div className="hm-gang__result hm-gang__result--waiting" role="status" aria-live="polite" aria-busy="true">
            <b>CHECKING&hellip;</b>
            <span>Holding the answer until the manifest replies.</span>
          </div>
        ) : null}

        {!pending && scan ? (
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
                {scan.berth ? <span>Holds: {scan.berth}</span> : null}
                {guestsLine(scan) ? <span>{guestsLine(scan)}</span> : null}
                {scan.otherVoyage ? (
                  <span>On another manifest — checked in for {scan.otherVoyage}.</span>
                ) : null}
              </>
            ) : scan.kind === "already" ? (
              <>
                <b>ALREADY CHECKED IN {scan.time ? logTime(scan.time, timeZone) : ""}</b>
                <span>
                  {scan.name} · {scan.memberNo}
                  {scan.guestOf ? ` · guest of ${scan.guestOf}` : ""}
                  {scan.vessel ? ` · ${scan.vessel}` : ""}
                </span>
                {scan.berth ? <span>Holds: {scan.berth}</span> : null}
                {guestsLine(scan) ? <span>{guestsLine(scan)}</span> : null}
              </>
            ) : scan.kind === "refused" ? (
              <>
                <b>NOT ABOARD YET</b>
                <span>{scan.reason}</span>
              </>
            ) : scan.kind === "unsure" ? (
              <>
                <b>CAN&rsquo;T CHECK THIS ONE FROM HERE</b>
                <span>
                  No signal, and the cached list does not cover guest stubs,
                  passes for another episode, or anyone who booked since this
                  page loaded. This is not a refusal.
                </span>
                <span>Board them by name off the manifest, or hold them for the crew.</span>
              </>
            ) : (
              <>
                <b>NOT ON THIS MANIFEST</b>
                <span>No pass matches that code on this episode.</span>
              </>
            )}
            {scan.queued && scan.kind !== "unsure" ? (
              <span className="hm-gang__offline">
                Answered from the cached list — no signal. It syncs on its own.
              </span>
            ) : null}
          </div>
        ) : null}

        {stuck.length > 0 ? (
          <div className="hm-gang__result hm-gang__result--already" role="status">
            <b>
              {stuck.length === 1
                ? "A QUEUED STAMP IS NOT LANDING"
                : `${stuck.length} QUEUED STAMPS ARE NOT LANDING`}
            </b>
            <span>
              Still queued and still trying — nothing is lost. Tell Shoreside if
              it does not clear.
            </span>
            {stuck.map((r) => (
              <span key={r.code}>
                {r.code} — {r.reason}
              </span>
            ))}
            <button
              type="button"
              className="ls-btn ls-btn--ghost ls-btn--sm"
              onClick={() => setStuck([])}
              style={{ marginTop: 8 }}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {rejected.length > 0 ? (
          <div className="hm-gang__result hm-gang__result--not_found" role="status">
            <b>{rejected.length === 1 ? "A QUEUED STAMP WAS REFUSED" : `${rejected.length} QUEUED STAMPS WERE REFUSED`}</b>
            {rejected.map((r) => (
              <span key={r.code}>
                {r.code} — {r.reason}
              </span>
            ))}
            <button
              type="button"
              className="ls-btn ls-btn--ghost ls-btn--sm"
              onClick={() => setRejected([])}
              style={{ marginTop: 8 }}
            >
              Clear
            </button>
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
          Name, member number, code, vessel, what the pass holds (cabin, daybed), guests by name,
          and waiver status — the paper fallback for a dead battery.
          {muster ? ` Muster: ${muster}.` : ""}
        </p>
      </section>

      {mounted
        ? createPortal(
            <div className="hm-doorlist" aria-hidden="true">
              <h1>Door list — {voyageTitle}</h1>
              <p>{departs} · {rows.length} passes · printed {logTime(new Date().toISOString(), timeZone)}</p>
              {muster ? <p>Muster: {muster}</p> : null}
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Member no</th>
                    <th>Code</th>
                    <th>Vessel</th>
                    <th>Holds</th>
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
                      <td>{berthLine(r)}</td>
                      <td>{guestLine(r)}</td>
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
