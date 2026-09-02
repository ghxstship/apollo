"use client";

import React from "react";
import { Badge, Button } from "@/components/ds";
import { holdCabinOnOption, releaseCabinOption } from "./actions";

export type CabinRow = {
  id: string;
  name: string;
  places: number;
  taken: number;
  mine: boolean;
};

/* The cabin plan, with the 72-hour hold.

   The countdown here is a rendering of `expires_at` and never the rule. A
   client timer that reaches zero has not released anything: the release happens
   inside the advisory lock the moment the next person asks for the room, which
   is why the number on screen going stale costs nothing and why nothing on this
   component is allowed to decide whether a hold is still live. */
export function CabinPlan({
  episodeId,
  cabins,
  option,
}: {
  episodeId: string;
  cabins: CabinRow[];
  option: { id: string; cabinId: string; expiresLabel: string } | null;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const act = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="cht-plan">
      {cabins.map((c) => {
        const open = Math.max(0, c.places - c.taken);
        const held = option?.cabinId === c.id;
        return (
          <div className="cht-plan__row" key={c.id}>
            <span className="cht-plan__name">{c.name}</span>
            <span className="cht-plan__count">
              {open} of {c.places} open
            </span>
            <span className="cht-plan__act">
              {held ? (
                <>
                  <Badge tone="caution">On option</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => act(() => releaseCabinOption(option.id))}
                  >
                    Let it go
                  </Button>
                </>
              ) : open === 0 ? (
                <Badge tone="outline">Spoken for</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !!option}
                  onClick={() => act(() => holdCabinOnOption(episodeId, c.id))}
                >
                  Hold 72 hours
                </Button>
              )}
            </span>
          </div>
        );
      })}
      {option ? (
        <p className="cht-plan__note">
          Your hold runs to {option.expiresLabel}. No charge until you
          confirm, and one hold at a time on a passage.
        </p>
      ) : null}
      {error ? (
        <p className="cht-plan__err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
