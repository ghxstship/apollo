import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = { title: "Off the chart" };

/* Next's stock 404 is a black-and-white line of text with no way back, and it
   was what a member hit on an unlisted handle, a stale episode link or a
   boarding stub that had already sailed.

   Only the global stylesheet is guaranteed here — this file renders inside the
   root layout and nothing else, so it may use the .ls-* layer and nothing from
   a route group's own sheet. It carried .hm-shell, .hm-eyebrow and .hm-mono,
   which live in (staff)/bridge.css and are loaded only under the Bridge: every
   public 404 rendered them unstyled. The public site has its own not-found
   under (site)/ that sits inside the nav and footer. */
export default function NotFound() {
  return (
    <main id="main" className="ls-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="ls-eyebrow" style={{ display: "block", color: "var(--gold-deep)" }}>
        404
      </span>
      <h1 style={{ marginTop: 12 }}>Off the chart.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>
        Nothing at this heading. The link may have expired, or the page may have
        sailed under a different name.
      </p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link className="ls-btn ls-btn--gold" href="/">
          Back to the club
        </Link>
        <Link className="ls-btn ls-btn--ghost" href="/support">
          Hail Shoreside
        </Link>
      </p>
      <p className="ls-mono-data" style={{ marginTop: 24, color: "var(--text-3)" }}>
        {MAILBOX.shore.toUpperCase()}
      </p>
    </main>
  );
}
