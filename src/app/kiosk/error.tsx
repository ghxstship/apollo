"use client";

import Link from "next/link";
import { useEffect } from "react";
import "./kiosk.css";

/* Dockside: a reload may be impossible offline, so the door stays usable and says what to do. */
/* kiosk.css is imported by the page, not by a layout, so this boundary imports
   it itself — rendered where the page's stylesheet has not loaded, .kio-*
   would otherwise draw nothing. The classes are the kiosk's own rather than
   the Bridge's; bridge.css never loads under /kiosk. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="ls-container kio-err">
      <span className="ls-eyebrow">Something broke</span>
      <h1>The kiosk lost the signal.</h1>
      <p>Check-ins you have already stamped are held on this device and go up when the bars come back. Tap Try again, or wave a member through by hand and stamp them later.</p>
      <p className="kio-err__acts">
        <button className="ls-btn ls-btn--gold" onClick={reset} type="button">Try again</button>
        <Link className="ls-btn ls-btn--ghost" href="/kiosk">Back to the door</Link>
      </p>
      {error.digest ? <p className="ls-mono-data kio-err__ref">REF {error.digest.toUpperCase()}</p> : null}
    </main>
  );
}
