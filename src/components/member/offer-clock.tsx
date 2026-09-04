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
  if (left === 0) {
    return (
      <span className={className} role="status">
        THE OFFER HAS LAPSED
      </span>
    );
  }
  const mins = left == null ? null : Math.ceil(left / 60_000);
  const running =
    mins == null
      ? ""
      : mins >= 120
        ? ` · ${Math.floor(mins / 60)}H ${mins % 60}M LEFT`
        : ` · ${mins} MIN LEFT`;
  return (
    <span className={className} role="status">
      YOURS UNTIL {untilLabel}
      {running}
    </span>
  );
}
