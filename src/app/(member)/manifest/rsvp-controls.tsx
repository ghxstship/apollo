"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, Stepper } from "@/components/ds";
import { releaseBerth, setGuests, setRsvpStatus } from "./actions";

export function RsvpControls({
  voyageId,
  myStatus,
  guests,
  berthsLeft,
  weatherHold,
  locked,
  lockedNote,
  recommended,
}: {
  voyageId: string;
  myStatus: "aboard" | "waitlist" | "not_going" | null;
  guests: number;
  berthsLeft: number;
  weatherHold: boolean;
  locked: boolean;
  lockedNote: string;
  recommended: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  if (locked) {
    return (
      <div className="voy-foot">
        <span className="voy-lock">
          {lockedNote} <Link href="/portal">Manage membership</Link>
        </span>
      </div>
    );
  }

  return (
    <div className="voy-foot">
      {weatherHold ? (
        <>
          <Badge tone="clay">Weather hold</Badge>
          <span className="voy-hold">
            Held for weather. We call it by 18:00 the night before.
          </span>
        </>
      ) : myStatus === "aboard" ? (
        <>
          <Badge tone="laurel">Aboard</Badge>
          <span className="mbr-mono">GUESTS</span>
          <Stepper
            size="sm"
            min={0}
            max={4}
            value={guests}
            onChange={(n) => run(() => setGuests(voyageId, n))}
          />
          <span className="voy-foot__spacer"></span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => releaseBerth(voyageId))}
          >
            Release berth
          </Button>
        </>
      ) : myStatus === "waitlist" ? (
        <>
          <Badge tone="outline">Waitlisted</Badge>
          <span className="voy-foot__spacer"></span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => releaseBerth(voyageId))}
          >
            Leave the list
          </Button>
        </>
      ) : berthsLeft <= 0 ? (
        <>
          <Badge tone="outline">Full</Badge>
          <span className="voy-foot__spacer"></span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setRsvpStatus(voyageId, "waitlist"))}
          >
            Join waitlist
          </Button>
        </>
      ) : (
        <>
          {myStatus === "not_going" ? <Badge tone="outline">Passed</Badge> : null}
          <span className="voy-foot__spacer"></span>
          {myStatus !== "not_going" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setRsvpStatus(voyageId, "not_going"))}
            >
              Not this one
            </Button>
          ) : null}
          <Button
            variant={recommended ? "brass" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => run(() => setRsvpStatus(voyageId, "aboard"))}
          >
            Confirm RSVP
          </Button>
        </>
      )}
      {error ? (
        <span className="voy-hold" role="alert" style={{ width: "100%" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
