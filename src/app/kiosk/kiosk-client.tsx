"use client";

import React from "react";
import { Button } from "@/components/ds";
import { literalCode } from "@/lib/boarding-code";
import { GANGWAY_QUEUE_KEY } from "@/lib/device-storage";
import { isUnanswered } from "@/lib/staff-errors";
import { CameraScanner } from "../(staff)/bridge/gangway/camera-scanner";
import { gangwayCheckIn, gangwayFlush, type ScanResult } from "../(staff)/bridge/gangway/actions";

/* Three screens, kit-faithful: Scan (animated scanline lives in the camera
   component), Confirm, Help. The kiosk never shows the roster — one person's
   result at a time, then back to the line.

   And an offline path, because a dockside kiosk that loses signal used to
   refuse everyone. The gangway console already solved this — queue the stamp
   on the device, flush it when the signal returns — so the kiosk runs the same
   discipline against the SAME queue: GANGWAY_QUEUE_KEY, the same item shape,
   drained through the same gangwayFlush action with the same final-vs-transient
   verdicts. One queue means whichever surface gets signal first lands the
   stamp, and unflushedCount() already guards it at sign-out. */

/* One pass the kiosk can answer for with no signal. Held in memory only —
   see the note in page.tsx. */
export type KioskPass = {
  passId: string;
  episodeId: string;
  code: string;
  name: string;
  waiverSigned: boolean;
  checkedInAt: string | null;
};

/* The gangway queue's item shape. Restated rather than imported because the
   accessors in gangway-client.tsx are module-private to that console; the KEY
   and the shape are the contract, and both come from the same places the
   console reads them (device-storage for the key, gangwayFlush for what a
   flush consumes). */
type QueueItem = {
  passId: string;
  episodeId: string;
  code: string;
  at: string;
  /* How many times the database has refused this for a reason we could not
     read. It stays queued regardless — the gangway console reads this to
     decide when to tell the operator. */
  tries?: number;
};

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(GANGWAY_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]) {
  try {
    localStorage.setItem(GANGWAY_QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked — the on-screen answer still stands */
  }
}

/* EVERY change to the queue goes through here — read-modify-write against
   storage, the gangway's rule, so a stamp queued concurrently (this kiosk mid
   flush, or a crew phone sharing the device) survives. */
function mutateQueue(fn: (items: QueueItem[]) => QueueItem[]): QueueItem[] {
  const next = fn(readQueue());
  writeQueue(next);
  return next;
}

type Screen =
  | { kind: "scan" }
  /* `queued` marks an answer given from the device with no signal — the one
     case that needs its own line on screen. */
  | { kind: "confirm"; result: ScanResult; queued?: boolean }
  | { kind: "help" }
  /* The kiosk had no way to say "I could not reach the manifest", so it said
     nothing at all and stopped working. */
  | { kind: "unreachable" };

export function KioskClient({ passes: serverPasses }: { passes: KioskPass[] }) {
  const [screen, setScreen] = React.useState<Screen>({ kind: "scan" });
  const [busy, setBusy] = React.useState(false);
  const [passes, setPasses] = React.useState<KioskPass[]>(serverPasses);
  const [queuedCount, setQueuedCount] = React.useState(0);
  /* Stamps the database finally refused after being recorded offline — an
     unsigned waiver that slipped a stale manifest, or a pass boarded on
     another device. The person is long past the kiosk, so this is a line for
     the crew, count only: codes and reasons stay off a screen that faces the
     queue. */
  const [needsCrew, setNeedsCrew] = React.useState(0);
  const backTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = React.useRef(false);

  /* Server data wins on load; queued marks re-apply on top, so a pass recorded
     offline before a reload still answers "already aboard". The sync runs on
     the next frame — localStorage is the external system here, the gangway's
     own idiom. */
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const marks = new Map(readQueue().map((item) => [item.passId, item.at]));
      setQueuedCount(marks.size);
      setPasses(
        serverPasses.map((p) =>
          !p.checkedInAt && marks.has(p.passId) ? { ...p, checkedInAt: marks.get(p.passId)! } : p
        )
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [serverPasses]);

  const markAboard = React.useCallback((passId: string, at: string) => {
    setPasses((prev) => prev.map((p) => (p.passId === passId ? { ...p, checkedInAt: at } : p)));
  }, []);

  /* The gangway's flush, verbatim in discipline: iterate the ids present at
     the start, re-read the queue per item so nothing queued mid-flush is
     wiped, drop only on success or a final refusal, keep everything
     indeterminate — a queued stamp is the only record that a person walked
     aboard. */
  const flush = React.useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const startingIds = readQueue().map((x) => x.passId);
      for (const passId of startingIds) {
        const item = readQueue().find((x) => x.passId === passId);
        if (!item) continue; /* dropped by another pass */
        try {
          const res = await gangwayFlush(item.passId, item.at);
          if (!res.error) {
            setQueuedCount(mutateQueue((q) => q.filter((x) => x.passId !== passId)).length);
          } else if (res.final) {
            /* A refusal that will not change on a retry. Done with the queue,
               but not done with the crew. */
            setQueuedCount(mutateQueue((q) => q.filter((x) => x.passId !== passId)).length);
            setNeedsCrew((n) => n + 1);
          } else {
            /* Indeterminate — the stamp stays, the attempt is counted, and the
               gangway console surfaces it if it keeps not landing. */
            mutateQueue((items) =>
              items.map((x) => (x.passId === passId ? { ...x, tries: (x.tries ?? 0) + 1 } : x))
            );
          }
        } catch {
          break; /* still offline — try again on the next signal */
        }
      }
    } finally {
      flushing.current = false;
    }
  }, []);

  /* The gangway's four ways in, because `online` alone misses marina wifi that
     stays associated with a dead uplink: mount, the `online` event, the tab
     becoming visible again, and a slow heartbeat. */
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

  const backToScan = React.useCallback(() => {
    if (backTimer.current) clearTimeout(backTimer.current);
    setScreen({ kind: "scan" });
  }, []);

  /* No signal — answer from the manifest this page loaded with, exactly the
     way the gangway answers from its cached roster. The manifest cannot speak
     for a guest stub, a booking made since load, or a pass for an episode off
     the board, so a miss here is "we cannot check that", never a refusal. */
  const localResolve = React.useCallback(
    (raw: string): Screen => {
      const scanned = literalCode(raw);
      const hit = passes.find((p) => p.code && literalCode(p.code) === scanned);
      if (!hit) return { kind: "unreachable" };
      if (hit.checkedInAt) {
        return { kind: "confirm", result: { outcome: "already", name: hit.name }, queued: true };
      }
      /* Nobody boards unsigned, signal or no signal — the gangway's rule. */
      if (!hit.waiverSigned) {
        return {
          kind: "confirm",
          result: {
            error:
              "Your waiver and release is outstanding — the crew at the gangway can take it, and then you board.",
          },
          queued: true,
        };
      }
      const at = new Date().toISOString();
      setQueuedCount(
        mutateQueue((q) => [
          ...q.filter((x) => x.passId !== hit.passId),
          { passId: hit.passId, episodeId: hit.episodeId, code: hit.code, at },
        ]).length
      );
      markAboard(hit.passId, at);
      return { kind: "confirm", result: { outcome: "aboard", name: hit.name }, queued: true };
    },
    [passes, markAboard]
  );

  const onScan = React.useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setScreen(localResolve(code));
        } else {
          try {
            /* Empty episodeId: the action resolves the code against upcoming
               episodes and reports otherEpisode when it lands elsewhere. */
            const result = await gangwayCheckIn(code, "00000000-0000-0000-0000-000000000000");
            setScreen({ kind: "confirm", result });
            if (result.outcome === "aboard" && !result.error) {
              /* Keep the in-memory manifest honest, so an offline re-scan of
                 the same pass says "already aboard" rather than queueing a
                 second stamp. */
              const scanned = literalCode(code);
              const hit = passes.find((p) => p.code && literalCode(p.code) === scanned);
              if (hit) markAboard(hit.passId, result.checkedInAt ?? new Date().toISOString());
            }
          } catch {
            /* This was unguarded, and one dropped request bricked the device
               for the rest of the night: the rejection escaped as an unhandled
               rejection, `setBusy(false)` never ran, and every later scan hit
               `if (busy) return` while the screen still read "Hold your code
               to the camera." Now the drop falls to the same offline path a
               dead signal takes — recorded on the device, synced later. */
            setScreen(localResolve(code));
          }
        }
      } finally {
        setBusy(false);
        /* The queue keeps moving: the confirmation stands 8 seconds, then the
           scanner comes back on its own. */
        backTimer.current = setTimeout(() => setScreen({ kind: "scan" }), 8000);
      }
    },
    [busy, localResolve, passes, markAboard]
  );

  if (screen.kind === "help") {
    return (
      <main id="main" className="kio" data-screen="help">
        <h1>A person is on the way.</h1>
        <p>
          Stay right here. If your code will not scan, the crew at the gangway
          can board you by name — the manifest knows you.
        </p>
        <Button size="lg" variant="outline" inverse onClick={backToScan}>
          Back to the scanner
        </Button>
      </main>
    );
  }

  if (screen.kind === "unreachable") {
    return (
      <main id="main" className="kio" data-screen="unreachable">
        <h1>One moment — we can&rsquo;t reach the manifest.</h1>
        <p>
          Nothing is wrong with your pass. The crew at the gangway can board you
          by name.
        </p>
        <Button size="lg" variant="outline" inverse onClick={backToScan}>
          Try again
        </Button>
      </main>
    );
  }

  if (screen.kind === "confirm") {
    const r = screen.result;
    /* `refused` used to include ANY r.error, and r.error is ERR_LAND ("That
       didn’t land.") for any database error and ERR_STAFF ("Staff only.")
       whenever the kiosk’s own hour-long token cannot be confirmed. So a
       weak signal, or a token quietly expiring on a device left facing the
       queue, met every member with "Not this door. / Staff only." — the
       machine’s problem, worn by the person in front of it. A refusal is
       now only a refusal OF THE PASS. */
    /* Named precisely rather than inferred from a missing outcome: a waiver
       refusal and a pass for an episode that has already gone also arrive with
       no outcome and no name, and both of those ARE answers the member needs
       to hear. Only the two generic errors are silence. */
    const cannotSay = isUnanswered(r.error);
    const refused = !cannotSay && (Boolean(r.error) || r.outcome === "not_found");
    if (cannotSay) {
      return (
        <main id="main" className="kio" data-screen="unreachable">
          <h1>One moment — we can&rsquo;t check that from here.</h1>
          <p>Nothing is wrong with your pass. A crew member at the gangway can board you by name.</p>
          <Button size="lg" variant="outline" inverse onClick={backToScan}>
            Try again
          </Button>
        </main>
      );
    }
    return (
      <main id="main" className="kio" data-screen="confirm" data-refused={refused ? "1" : "0"}>
        {refused ? (
          <>
            <h1>Not this door.</h1>
            <p>{r.error ?? "That code is not on tonight's manifest."}</p>
            <p className="kio-mono">A crew member can help at the gangway.</p>
          </>
        ) : r.outcome === "already" ? (
          <>
            <h1>Already aboard.</h1>
            <p>{r.name} — you are checked in. Enjoy the night.</p>
          </>
        ) : (
          <>
            <h1>Welcome aboard.</h1>
            <p>
              {r.name}
              {r.vessel ? ` — ${r.vessel}` : ""}
            </p>
            {r.guestNames?.length ? (
              <p className="kio-mono">WITH {r.guestNames.join(" · ").toUpperCase()}</p>
            ) : null}
            {screen.queued ? (
              <p className="kio-mono">RECORDED — SYNCS WHEN THE SIGNAL RETURNS</p>
            ) : null}
          </>
        )}
        <Button size="lg" variant="outline" inverse onClick={backToScan}>
          Next
        </Button>
      </main>
    );
  }

  return (
    <main id="main" className="kio" data-screen="scan">
      <h1>Hold your code to the camera.</h1>
      <div className="kio-cam">
        <CameraScanner onScan={onScan} />
      </div>
      <p className="kio-mono">MEMBER CARD OR BOARDING STUB · THE CAMERAS ARE ON</p>
      {queuedCount > 0 ? (
        <p className="kio-mono">
          {queuedCount} RECORDED OFFLINE · SYNCS WHEN THE SIGNAL RETURNS
        </p>
      ) : null}
      {needsCrew > 0 ? (
        <p className="kio-mono">
          {needsCrew} RECORDED {needsCrew === 1 ? "SCAN NEEDS" : "SCANS NEED"} THE CREW AT THE GANGWAY
        </p>
      ) : null}
      <Button size="lg" variant="ghost" inverse onClick={() => setScreen({ kind: "help" })}>
        I need a person
      </Button>
    </main>
  );
}
