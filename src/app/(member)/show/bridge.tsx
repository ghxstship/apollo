"use client";

import React from "react";
import { Button, Select } from "@/components/ds";
import {
  DECK_FLAGS,
  DECK_STATES,
  POD_LABEL,
  POD_TONE,
  type DeckState,
  type PodSessionRow,
} from "@/lib/show";
import { advancePod, enqueuePod, issueTheEnvelopes, seedTheBoard, setDeckState } from "./actions";

/* The two controls on the bridge board: which flag flies, and where each guest
   is in the pod queue. Both write through server actions whose authority is RLS
   — a non-staff caller reaching these by any route is refused by the database,
   so what these controls do is choose, not permit. */

export function SignalFlags({
  episodeId,
  flying,
}: {
  episodeId: string;
  flying: DeckState | null;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const raise = (state: DeckState | null) =>
    start(async () => {
      setError(null);
      const res = await setDeckState(episodeId, state);
      if (res.error) setError(res.error);
    });

  return (
    <>
      <div className="shw-flags">
        {DECK_STATES.map((s) => {
          const flag = DECK_FLAGS[s];
          const isFlying = flying === s;
          return (
            <button
              key={s}
              type="button"
              className={[
                "shw-flag",
                flag.inverse ? "shw-flag--inverse" : "",
                flag.caution ? "shw-flag--caution" : "",
                isFlying ? "shw-flag--flying" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "start" }}
              aria-pressed={isFlying}
              disabled={pending}
              onClick={() => raise(isFlying ? null : s)}
            >
              <span className="shw-flag__field">
                <span className={`shw-flag__mark shw-flag__mark--${flag.mark}`} aria-hidden="true" />
              </span>
              <span className="shw-flag__name">{flag.label}</span>
              <span className="shw-flag__says">{flag.says}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="shw-note" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <p className="shw-note">
        One flag flies at a time — pressing the flying one lowers it. Geometry
        carries the meaning, never a division hue, and guests learn all four in
        one sailing.
      </p>
    </>
  );
}

export function PodQueue({
  episodeId,
  sessions,
  names,
  candidates,
}: {
  episodeId: string;
  sessions: PodSessionRow[];
  names: Record<string, string>;
  /** Aboard passes not yet in the queue — the only rows enqueuePod can add. */
  candidates: Array<{ id: string; name: string }>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [pick, setPick] = React.useState("");

  const move = (id: string, state: string, blur?: true) =>
    start(async () => {
      setError(null);
      const res = await advancePod(id, state, blur ? { blur } : {});
      if (res.error) setError(res.error);
    });

  /* The queue's front door. The state, the blur, and the VIP flag are all the
     database's business — the crew choose only who, and the row lands at the
     back of the line as 'waiting'. */
  const add = () =>
    start(async () => {
      setError(null);
      const res = await enqueuePod(episodeId, pick);
      if (res.error) setError(res.error);
      else setPick("");
    });

  const enqueue = candidates.length ? (
    <div className="shw-acts" style={{ alignItems: "end", gap: 10 }}>
      <Select
        label="Add a guest"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        options={[
          { value: "", label: "Pick an aboard pass" },
          ...candidates.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <Button variant="outline" size="sm" disabled={pending || !pick} onClick={add}>
        Add to the queue
      </Button>
    </div>
  ) : (
    <p className="shw-note">
      {sessions.length
        ? "Everyone aboard is already in the queue."
        : "Nobody aboard to queue yet — passes appear here once guests are aboard."}
    </p>
  );

  if (!sessions.length) {
    return (
      <>
        <p className="shw-note">Nobody in the queue. The Pod opens at 12:45.</p>
        {enqueue}
        {error ? (
          <p className="shw-note" role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="shw-queue">
        {sessions.map((s) => (
          <div className="shw-queue__row" key={s.id}>
            <span className="shw-queue__n">{String(s.position).padStart(2, "0")}</span>
            <span className="shw-queue__who">{names[s.rsvp_id] ?? "A guest"}</span>
            {s.vip_priority ? (
              <span className="shw-queue__tok" style={{ color: "var(--text-faint)" }}>
                VIP priority
              </span>
            ) : null}
            {s.blur_required ? (
              <span className="shw-queue__tok" style={{ color: "var(--caution)" }}>
                Blur requested
              </span>
            ) : null}
            <span className="shw-queue__tok" style={{ color: POD_TONE[s.state] }}>
              {POD_LABEL[s.state]}
            </span>
            <span className="shw-acts">
              {s.state === "waiting" ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => move(s.id, "ready")}>
                  Ready
                </Button>
              ) : null}
              {s.state === "ready" ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => move(s.id, "recording")}>
                  Record
                </Button>
              ) : null}
              {s.state === "recording" ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => move(s.id, "done")}>
                  Done
                </Button>
              ) : null}
              {/* Raise-only. There is no control here that clears a blur, and
                  the trigger would refuse to lower one anyway — a guest who asks
                  the crew on the day gets it set, and nothing takes it off. */}
              {!s.blur_required && s.state !== "done" ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => move(s.id, s.state, true)}>
                  Blur
                </Button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {enqueue}
      {error ? (
        <p className="shw-note" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      <p className="shw-note">
        Blur requested is set from the Preference Sheet and cannot be overridden
        on deck. A guest who asked for anonymity is never shown unblurred in any
        cut, internal or public — the state travels with the file.
      </p>
    </>
  );
}

export function BoardControls({ episodeId, empty }: { episodeId: string; empty: boolean }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="shw-acts">
      {empty ? (
        <Button size="sm" disabled={pending} onClick={() => run(() => seedTheBoard(episodeId))}>
          Lay out the run of show
        </Button>
      ) : null}
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => issueTheEnvelopes(episodeId))}>
        Issue the envelopes
      </Button>
      {error ? (
        <p className="shw-note" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
