"use client";

import React from "react";
import { Button } from "@/components/ds";
import { CameraScanner } from "../(staff)/bridge/gangway/camera-scanner";
import { gangwayCheckIn, type ScanResult } from "../(staff)/bridge/gangway/actions";
import { isUnanswered } from "@/lib/staff-errors";

/* Three screens, kit-faithful: Scan (animated scanline lives in the camera
   component), Confirm, Help. The kiosk never shows the roster — one person's
   result at a time, then back to the line. */

type Screen =
  | { kind: "scan" }
  | { kind: "confirm"; result: ScanResult }
  | { kind: "help" }
  /* The kiosk had no way to say "I could not reach the manifest", so it said
     nothing at all and stopped working. */
  | { kind: "unreachable" };

export function KioskClient() {
  const [screen, setScreen] = React.useState<Screen>({ kind: "scan" });
  const [busy, setBusy] = React.useState(false);
  const backTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const backToScan = React.useCallback(() => {
    if (backTimer.current) clearTimeout(backTimer.current);
    setScreen({ kind: "scan" });
  }, []);

  const onScan = React.useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      try {
        /* Empty voyageId: the action resolves the code against upcoming charters
           and reports otherVoyage when it lands elsewhere. */
        const result = await gangwayCheckIn(code, "00000000-0000-0000-0000-000000000000");
        setScreen({ kind: "confirm", result });
      } catch {
        /* This was unguarded, and one dropped request bricked the device for
           the rest of the night. The action's fetch REJECTS when the signal
           goes; the rejection escaped as an unhandled rejection, which no React
           error boundary catches because it is an async handler; `setBusy(false)`
           was on the line below and never ran; and every later scan hit
           `if (busy) return`. The screen still read "Hold your code to the
           camera." A kiosk propped at the dock, looking perfect, admitting
           nobody, with the queue backing up behind it. */
        setScreen({ kind: "unreachable" });
      } finally {
        setBusy(false);
        /* The queue keeps moving: the confirmation stands 8 seconds, then the
           scanner comes back on its own. */
        backTimer.current = setTimeout(() => setScreen({ kind: "scan" }), 8000);
      }
    },
    [busy]
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
       didn\u2019t land.") for any database error and ERR_STAFF ("Staff only.")
       whenever the kiosk\u2019s own hour-long token cannot be confirmed. So a
       weak signal, or a token quietly expiring on a device left facing the
       queue, met every member with "Not this door. / Staff only." — the
       machine\u2019s problem, worn by the person in front of it. A refusal is
       now only a refusal OF THE PASS. */
    /* Named precisely rather than inferred from a missing outcome: a waiver
       refusal and a pass for a sailing that has already gone also arrive with
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
      <Button size="lg" variant="ghost" inverse onClick={() => setScreen({ kind: "help" })}>
        I need a person
      </Button>
    </main>
  );
}
