"use client";

import React from "react";
import { Button } from "@/components/ds";
import { SEGMENTS, SEGMENT_LABEL, type Segment, type SegmentCapacityRow } from "@/lib/vetting";
import { offerTheNextPlace } from "./actions";

/* The crew's end of the waitlist. Rendered only for staff, on the same page the
   member reads, because the queue and the composition are one thing and looking
   at them on two screens is how a seat gets offered into a segment that is
   already full.

   The button is offered only where there is room. offer_the_next_place checks
   that again under the queue lock and refuses if the room went away between the
   render and the click — this is which control to draw, not whether the offer is
   allowed. */

export interface QueueRow {
  id: string;
  segment: Segment;
  place: number;
  offered_at: string | null;
  claim_expires_at: string | null;
  claimed_at: string | null;
  released_at: string | null;
}

export function QueuePanel({
  episodeId,
  rows,
  capacity,
  asOf,
}: {
  episodeId: string;
  rows: QueueRow[];
  capacity: SegmentCapacityRow[];
  /** Request time, read on the server and passed down. The expiry comparison
      has to happen somewhere, and a clock read during a client render is both
      impure and a hydration mismatch waiting to happen. */
  asOf: number;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const remainingIn = (s: Segment) => capacity.find((c) => c.segment === s)?.remaining ?? 0;
  /* Waiting: in the line, never offered, still live. Outstanding: offered, and
     the six hours are still running. The two are counted separately because a
     segment with one person waiting and one offer already out has nothing to
     offer — the seat is spoken for until the six hours run out.

     Outstanding used to be "has offered_at, no released_at", and released_at is
     stamped ONLY by lapse_stale_waitlist_offers — which is not on cron, is not
     executable by `authenticated`, and runs only inside offer_the_next_place
     and claim_your_place. So a dead offer kept counting as outstanding until
     somebody happened to press a button, which is the one state where this
     panel hid the Offer control from the crew who could have freed the seat.
     The clock settles it without a scheduler. */
  const live = (r: QueueRow) => !r.claimed_at && !r.released_at;
  const running = (r: QueueRow) =>
    !!r.claim_expires_at && new Date(r.claim_expires_at).getTime() > asOf;
  const waitingIn = (s: Segment) =>
    rows.filter((r) => r.segment === s && live(r) && !r.offered_at).length;
  const outstandingIn = (s: Segment) =>
    rows.filter((r) => r.segment === s && live(r) && !!r.offered_at && running(r)).length;
  const lapsedIn = (s: Segment) =>
    rows.filter((r) => r.segment === s && live(r) && !!r.offered_at && !running(r)).length;

  const offer = (s: Segment) =>
    start(async () => {
      setError(null);
      setSaid(null);
      const res = await offerTheNextPlace(episodeId, s);
      if (res.error) setError(res.error);
      else setSaid(`Offered to position one in ${SEGMENT_LABEL[s].toLowerCase()}. One notice, six hours.`);
    });

  return (
    <div className="vet-panel">
      <span className="vet-eyebrow">Crew · the line</span>
      <p className="vet-title">Who is waiting</p>

      <div>
        {SEGMENTS.map((s) => {
          const waiting = waitingIn(s);
          const room = remainingIn(s);
          const out = outstandingIn(s);
          const gone = lapsedIn(s);
          return (
            <div className="vet-row" key={s}>
              <span className="vet-row__label">{SEGMENT_LABEL[s]}</span>
              <span className="vet-row__value">
                {waiting === 0 ? "Nobody waiting" : `${waiting} waiting`}
                {out ? ` · ${out} offered` : ""}
                {gone ? ` · ${gone} lapsed` : ""}
                {room ? ` · ${room} free` : " · full"}
              </span>
              <span className="vet-row__token">
                {waiting > 0 && room > 0 ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => offer(s)}>
                    Offer the next
                  </Button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="vet-note" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : said ? (
        <p className="vet-note" role="status">{said}</p>
      ) : null}

      <p className="vet-note">
        An offer writes once and stands for six hours. After that it counts for
        nothing here, and the row is released on the next offer or claim, which
        take the lapse under the same lock — no scheduler has to be up for any
        of that to be true.
      </p>
    </div>
  );
}
