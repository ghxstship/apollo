"use client";

import React from "react";
import { Button } from "@/components/ds";
import { CameraScanner } from "../(staff)/bridge/gangway/camera-scanner";
import { gangwayCheckIn, type ScanResult } from "../(staff)/bridge/gangway/actions";

/* Three screens, kit-faithful: Scan (animated scanline lives in the camera
   component), Confirm, Help. The kiosk never shows the roster — one person's
   result at a time, then back to the line. */

type Screen = { kind: "scan" } | { kind: "confirm"; result: ScanResult } | { kind: "help" };

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
      /* Empty voyageId: the action resolves the code against upcoming charters
         and reports otherVoyage when it lands elsewhere. */
      const result = await gangwayCheckIn(code, "00000000-0000-0000-0000-000000000000");
      setBusy(false);
      setScreen({ kind: "confirm", result });
      /* The queue keeps moving: the confirmation stands 8 seconds, then the
         scanner comes back on its own. */
      backTimer.current = setTimeout(() => setScreen({ kind: "scan" }), 8000);
    },
    [busy]
  );

  if (screen.kind === "help") {
    return (
      <main className="kio" data-screen="help">
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

  if (screen.kind === "confirm") {
    const r = screen.result;
    const refused = Boolean(r.error) || r.outcome === "not_found";
    return (
      <main className="kio" data-screen="confirm" data-refused={refused ? "1" : "0"}>
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
    <main className="kio" data-screen="scan">
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
