import type { Metadata } from "next";
import Link from "next/link";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = { title: "Off the chart" };

/* Next's stock 404 is a black-and-white line of text with no way back, and it
   was what a member hit on an unlisted handle, a stale charter link or a
   boarding stub that had already sailed. */
export default function NotFound() {
  return (
    <main className="hm-shell" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <span className="hm-eyebrow">404</span>
      <h1 style={{ marginTop: 12 }}>Off the chart.</h1>
      <p style={{ maxWidth: 460, marginTop: 12 }}>
        Nothing at this heading. The link may have expired, or the page may have
        sailed under a different name during the rebrand.
      </p>
      <p style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link className="hm-btn hm-btn--gold" href="/">
          Back to the club
        </Link>
        <Link className="hm-btn hm-btn--ghost" href="/support">
          Hail Shoreside
        </Link>
      </p>
      <p className="hm-mono" style={{ marginTop: 24, fontSize: 12 }}>
        {MAILBOX.shore.toUpperCase()}
      </p>
    </main>
  );
}
