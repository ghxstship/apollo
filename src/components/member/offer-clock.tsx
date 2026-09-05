"use client";

import React from "react";

/* One countdown per offer. A waitlist offer stands for club_setting
   'waitlist_claim_hours' from the moment it is written, and the row carries
   the exact instant it lapses — so this reads THAT, never the setting plus a
   guess at when the offer went out.

   The server renders the fixed half only (the hour it lapses, on the member's
   clock); the running half fills in after mount, because a clock read during
   render is both impure and a hydration mismatch. Returns nothing once the
   offer has lapsed: the row is released by the next offer or claim, and a
   countdown at zero beside a button that will now refuse is a lie. */
export function OfferClock({
  expiresAt,
  untilLabel,
  className,
}: {
  expiresAt: string;
  /** The lapse hour, already formatted on the member's clock. */
  untilLabel: string;
  className?: string;
}) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const t = setInterval(tick, 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  const end = new Date(expiresAt).getTime();
  const left = now == null ? null : Math.max(0, end - now);
  const lapsed = left === 0;

  /* The lapse is the one thing this clock ever announces, and it was announced
     the way that does not work: a `role="status"` element MOUNTED with its
     text already inside it. A live region has to exist and be empty when the
     reader starts watching it — a region that arrives with content is not a
     change to anything, and browsers and readers disagree about whether it is
     read at all. Toast hit this first and documents the workaround; this is
     that workaround, and it applies here for a stronger reason: Toast at least
     announces on every call, while this component has exactly one announcement
     in its whole life, at the moment a member's hold on a seat expires.

     So it writes into the standing region in the root layout, the same one
     Toast speaks through, which has been on the page and empty since the first
     paint. Polite, not assertive: the offer lapsing is worth hearing at the
     end of the current sentence, not on top of it.

     The effect is keyed on `lapsed`, which goes false→true exactly once, so
     the 30-second tick cannot re-announce; and the cleanup clears the region
     only if this clock's own sentence is still the one standing in it — two
     offers lapsing in the same minute must not silence each other. Rendered
     outside the root layout (a test, a storybook) there is no region and
     nothing is said, which is the same fallback Toast takes when it has
     nowhere to write. */
  React.useEffect(() => {
    if (!lapsed) return;
    const region = document.getElementById("ls-announcer");
    if (!region) return;
    const text = "The offer has lapsed.";
    region.textContent = text;
    return () => {
      if (region.textContent === text) region.textContent = "";
    };
  }, [lapsed]);

  if (lapsed) {
    /* No role on the visible copy. It is the same sentence the region above
       is carrying, and a reader that heard both would hear it twice. */
    return <span className={className}>THE OFFER HAS LAPSED</span>;
  }
  const mins = left == null ? null : Math.ceil(left / 60_000);
  const running =
    mins == null
      ? ""
      : mins >= 120
        ? ` · ${Math.floor(mins / 60)}H ${mins % 60}M LEFT`
        : ` · ${mins} MIN LEFT`;
  /* No role here either. The text changes every minute, and a live region that
     changes every minute is a screen reader interrupting whatever is being
     read, sixty times an hour, to say the same sentence with one number
     different. The lapse is the event worth announcing — that is what the
     effect above does — and the running total is there to be read, not
     broadcast. */
  return (
    <span className={className}>
      YOURS UNTIL {untilLabel}
      {running}
    </span>
  );
}
