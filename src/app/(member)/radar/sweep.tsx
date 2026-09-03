"use client";

import React from "react";
import { Button, Input } from "@/components/ds";
import {
  PHASE_LINE,
  minutesUntil,
  radarPhase,
  slotsFor,
  type RadarClock,
  type RadarPin,
} from "@/lib/radar";
import { openTheLog, plotCourse, unplotCourse } from "./actions";

/* The sweep, the three slots, and the envelope. One client component because
   all three read the same clock and the same pick list, and splitting them would
   mean three components each deciding independently whether it is 17:30 yet. */

/* Pins sit at even angles on the middle ring. Even, because there is no distance
   and no ranking in this product: a pin placed nearer the centre would be
   claiming something about the person, and the kit's whole rule is that the
   sweep says nothing except that they are here. */
function place(i: number, total: number): React.CSSProperties {
  const angle = (i / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    left: `calc(50% + ${Math.round(Math.cos(angle) * 82)}px - 22px)`,
    top: `calc(50% + ${Math.round(Math.sin(angle) * 82)}px - 22px)`,
  };
}

const initials = (name: string, couple: boolean) =>
  couple ? `${name[0] ?? "?"}+` : (name[0] ?? "?").toUpperCase();

export function Sweep({
  episodeId,
  myPass,
  clock,
  pins,
  listed,
}: {
  episodeId: string;
  myPass: string;
  clock: RadarClock | null;
  pins: RadarPin[];
  listed: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [token, setToken] = React.useState("");
  const [pending, start] = React.useTransition();

  /* Read once per render, on the server's clock via the page and then on the
     browser's. It is a label; the lock itself is held by the trigger, so a
     browser whose clock is wrong gets a wrong countdown and a right refusal —
     which is the correct way round. */
  const phase = radarPhase(clock);
  const left = minutesUntil(clock?.locks_at);
  const plotted = pins.filter((p) => p.plotted);
  const slots = slotsFor(clock, plotted);
  const used = plotted.length;
  const total = clock?.slots ?? 3;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <>
      <div className={`rdr-panel${phase === "open" ? " rdr-panel--live" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className={`rdr-eyebrow${phase === "open" ? " rdr-eyebrow--live" : ""}`}>
            {phase === "open" ? "Radar · live" : "Radar"}
          </span>
          <span className="rdr-eyebrow">
            {phase === "open" && left !== null ? `${left} minutes remaining` : "Picks close 17:30"}
          </span>
        </div>

        <p className="rdr-note">{PHASE_LINE[phase]}</p>

        {!listed ? (
          /* Named, rather than an empty sweep with no explanation. This member
             asked to be off the manifest, radar_sweep honours that, and the
             consequence — nobody can pick them, so nothing they pick can ever
             come back mutual — is a dead end they are owed the reason for. */
          <div className="rdr-strip">
            <span className="rdr-strip__badge">Off the manifest</span>
            <span className="rdr-strip__title">You are not a pin.</span>
            <p className="rdr-strip__body">
              You asked to stay off the manifest, and Radar honours that — which
              means nobody aboard can pick you, so nothing you pick can come
              back mutual. Your page has the switch.
            </p>
          </div>
        ) : null}

        <div className="rdr-plot" aria-label="Everyone aboard">
          <span className="rdr-ring rdr-ring--1" aria-hidden="true" />
          <span className="rdr-ring rdr-ring--2" aria-hidden="true" />
          <span className="rdr-ring rdr-ring--3" aria-hidden="true" />
          <span className="rdr-self" aria-hidden="true" />
          {pins.map((pin, i) => (
            <button
              key={pin.passId}
              type="button"
              className={`rdr-pin${pin.plotted ? " rdr-pin--plotted" : ""}`}
              style={place(i, pins.length)}
              disabled={pending || phase !== "open"}
              aria-pressed={pin.plotted}
              onClick={() =>
                run(() =>
                  pin.plotted
                    ? unplotCourse(episodeId, myPass, pin.passId)
                    : plotCourse(episodeId, myPass, pin.passId)
                )
              }
            >
              <span className="rdr-pin__dot">{initials(pin.name, pin.couple)}</span>
              <span className="rdr-pin__name">{pin.couple ? `${pin.name} + 1` : pin.name}</span>
            </button>
          ))}
        </div>

        <p className="rdr-note">
          Everyone aboard, no distance, no ranking. Couples show as one pin. Tap
          a pin to pick someone.
        </p>

        <div className="rdr-meter">
          <div className="rdr-meter__head">
            <span>Picks used</span>
            {/* The tenth division-hue-as-state declaration, and the only one
                that was inline rather than in radar.css. It heads the meter
                whose fill it must match, so it takes the same house accent at
                the type step. */}
            <span style={{ color: "var(--text-accent)" }}>
              {used} of {total}
            </span>
          </div>
          <div className="rdr-meter__track">
            <div className="rdr-meter__fill" style={{ width: `${(used / total) * 100}%` }} />
          </div>
          <span className="rdr-eyebrow">Locks at 17:30 · no edits after</span>
        </div>

        {error ? (
          <p className="rdr-note" role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="rdr-panel">
        <span className="rdr-eyebrow">Three slots</span>
        <div className="rdr-slots">
          {slots.map((slot) => (
            <div key={slot.index} className={`rdr-slot rdr-slot--${slot.state}`}>
              <span className="rdr-slot__n">
                {slot.state === "locked" && !slot.pin ? "After 17:30" : `Slot ${String(slot.index).padStart(2, "0")}`}
              </span>
              <span className={`rdr-slot__who${slot.pin ? "" : " rdr-slot__who--empty"}`}>
                {slot.pin ? slot.pin.name : slot.state === "locked" ? "Locked" : "Open"}
              </span>
              {slot.pin && phase === "open" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => unplotCourse(episodeId, myPass, slot.pin!.passId))}
                >
                  Change
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <p className="rdr-note">
          Three is the ceiling, not a target. Leaving slots open is a real choice,
          and it costs you nothing.
        </p>
      </div>

      {phase === "unlocked" || phase === "locked" ? (
        <div className="rdr-panel">
          <span className="rdr-eyebrow">Captain&rsquo;s Log</span>
          <p className="rdr-note">
            The code is printed inside the sealed envelope handed to you at the
            dock. It opens at 19:00 and the contacts run for 24 hours from then.
          </p>
          <div className="rdr-acts">
            <Input
              label="Envelope code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ minWidth: 280 }}
            />
            <Button size="sm" disabled={pending || !token} onClick={() => run(() => openTheLog(token))}>
              Open the log
            </Button>
          </div>
          {error ? (
            <p className="rdr-note" role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
