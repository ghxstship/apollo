import type { Metadata } from "next";
import { LinkButton } from "@/components/ds";
import { MAILBOX } from "@/lib/brand";
import "./boundary.css";

export const metadata: Metadata = { title: "Off the chart" };

/* Next's stock 404 is a black-and-white line of text with no way back, and it
   was what a member hit on an unlisted handle, a stale episode link or a
   boarding stub that had already sailed.

   Only the global stylesheet is guaranteed here — this file renders inside the
   root layout and nothing else, so it may use the .ls-* layer, boundary.css
   (which it imports itself) and nothing from a route group's own sheet. It
   carried .hm-shell, .hm-eyebrow and .hm-mono, which live in (staff)/bridge.css
   and are loaded only under the Bridge: every public 404 rendered them
   unstyled. The public site has its own not-found under (site)/ that sits
   inside the nav and footer. */
export default function NotFound() {
  return (
    <main id="main" className="ls-container ls-rise rb-page">
      <span className="ls-eyebrow ls-eyebrow--gold rb-page__eyebrow">404</span>
      <h1>Off the chart.</h1>
      <p className="rb-page__sub">
        Nothing at this heading. The link may have expired, or the page may have
        sailed under a different name.
      </p>
      <p className="rb-page__cta">
        <LinkButton variant="gold" href="/">
          Back to the club
        </LinkButton>
        <LinkButton variant="ghost" href="/support">
          Hail Shoreside
        </LinkButton>
      </p>
      <p className="ls-mono-data rb-page__ref">{MAILBOX.shore.toUpperCase()}</p>
    </main>
  );
}
