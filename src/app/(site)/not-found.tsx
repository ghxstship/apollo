import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/site/link-button";
import { MAILBOX } from "@/lib/brand";

export const metadata: Metadata = { title: "Off the chart" };

/* The public site's 404, inside the site's own chrome.

   Without this file a notFound() thrown by /episodes/[slug], /log/[slug],
   /series/[slug] or /crew/[slug] climbed to the root not-found, which renders
   inside the root layout alone — no nav, no footer, and none of this route
   group's stylesheet. A reader who followed a stale episode link landed on a
   bare page with no way back but the one button on it. */
export default function SiteNotFound() {
  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">404</span>
        <h1>Off the chart.</h1>
        <p className="ws-phead__sub">
          Nothing at this heading. The episode may have wrapped, the link may
          have expired, or the page may have sailed under a different name.
        </p>
      </div>
      <div className="ws-zero" style={{ marginTop: 40 }}>
        <span className="ws-zero__label">Where to next</span>
        <p>
          Every episode of the season is on the <Link href="/episodes">manifest</Link>,
          and what already happened is in <Link href="/log">The Log</Link>.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <LinkButton href="/episodes" variant="gold" size="sm">
            See the episodes
          </LinkButton>
          <LinkButton href="/support" variant="outline" size="sm">
            Hail Shoreside
          </LinkButton>
        </div>
        <span className="ls-mono-data ws-upper" style={{ color: "var(--text-3)" }}>
          {MAILBOX.shore}
        </span>
      </div>
    </div>
  );
}
