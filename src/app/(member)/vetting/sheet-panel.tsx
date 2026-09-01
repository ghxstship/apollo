"use client";

import React from "react";
import { Button, Textarea } from "@/components/ds";
import {
  BOUNDARY_LABEL,
  BOUNDARY_TOPICS,
  DRINKS,
  STANCES,
  STANCE_LABEL,
  STANCE_TONE,
  type BoundaryRow,
  type PreferenceSheetRow,
  type Stance,
} from "@/lib/vetting";
import { saveDrinks, saveFlags, setBoundary } from "./actions";

/* The Preference Sheet, three parts. Every answer here is read by the vetting
   team and the Chief Vibe Stew and by nobody else — never by another guest,
   never in Radar. That is enforced by RLS on preference_sheets and
   preference_boundaries, not by this component keeping quiet.

   One of these controls has an effect the member cannot see from here: setting
   "Being photographed" to NEVER is what makes blur_is_required() true, and no
   crew tablet can lower it afterwards. The copy says so, because a consent
   control whose consequence is invisible is not much of a control. */

export function SheetPanel({
  sheet,
  boundaries,
}: {
  sheet: PreferenceSheetRow | null;
  boundaries: BoundaryRow[];
}) {
  const [drinks, setDrinks] = React.useState<string[]>(sheet?.drinks ?? []);
  const [green, setGreen] = React.useState(sheet?.flag_green ?? "");
  const [red, setRed] = React.useState(sheet?.flag_red ?? "");
  const [stances, setStances] = React.useState<Record<string, Stance>>(() =>
    Object.fromEntries(boundaries.map((b) => [b.topic, b.stance]))
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = (label: string, fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else setSaved(label);
    });

  const toggleDrink = (d: string) => {
    const next = drinks.includes(d) ? drinks.filter((x) => x !== d) : [...drinks, d];
    setDrinks(next);
    run("Drinks", () => saveDrinks(next));
  };

  const pickStance = (topic: string, stance: Stance) => {
    setStances((s) => ({ ...s, [topic]: stance }));
    run("Boundaries", () => setBoundary(topic, stance));
  };

  return (
    <div className="vet-grid">
      {/* Part 1 */}
      <div className="vet-panel">
        <span className="vet-eyebrow">Part 1 · Drinks</span>
        <p className="vet-title">What are you drinking?</p>
        <div className="vet-chips" role="group" aria-label="Drinks">
          {DRINKS.map((d) => (
            <button
              key={d}
              type="button"
              className="vet-chip"
              aria-pressed={drinks.includes(d)}
              onClick={() => toggleDrink(d)}
              disabled={pending}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="vet-note">
          Zero proof is a first-class answer. The bar stocks for it and the crew
          never asks twice.
        </p>
      </div>

      {/* Part 2 */}
      <div className="vet-panel">
        <span className="vet-eyebrow">Part 2 · Boundaries</span>
        <p className="vet-title">What is off the table?</p>
        <div>
          {BOUNDARY_TOPICS.map((topic) => {
            const current = stances[topic];
            return (
              <div className="vet-row" key={topic}>
                <span className="vet-row__value" style={{ flex: 1 }}>
                  {BOUNDARY_LABEL[topic]}
                </span>
                <span className="vet-stances" role="group" aria-label={BOUNDARY_LABEL[topic]}>
                  {STANCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="vet-stance"
                      aria-pressed={current === s}
                      style={current === s ? { color: STANCE_TONE[s] } : undefined}
                      onClick={() => pickStance(topic, s)}
                      disabled={pending}
                    >
                      {STANCE_LABEL[s]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <p className="vet-note">
          Boundaries drive real operations: seating, the media team&rsquo;s shot list,
          and the wristband issued at check-in. Setting &ldquo;Being photographed&rdquo; to
          never blurs you in the Confessional Pod, and the crew cannot lift it on deck.
        </p>
      </div>

      {/* Part 3 */}
      <div className="vet-panel">
        <span className="vet-eyebrow">Part 3 · Flags</span>
        <p className="vet-title">Green and red</p>
        <Textarea
          label="Green"
          rows={3}
          maxLength={200}
          value={green}
          onChange={(e) => setGreen(e.target.value)}
          hint={`${green.length} of 200`}
        />
        <Textarea
          label="Red"
          rows={3}
          maxLength={200}
          value={red}
          onChange={(e) => setRed(e.target.value)}
          hint={`${red.length} of 200`}
        />
        <div className="vet-acts">
          <Button size="sm" onClick={() => run("Flags", () => saveFlags(green, red))} disabled={pending}>
            Save
          </Button>
        </div>
        <p className="vet-note">
          Two short lists, 200 characters each. Used by the vetting team and the
          Chief Vibe Stew — never surfaced in Radar, never shown to another guest.
          Deleted with your account, and never used for advertising.
        </p>
      </div>

      {error ? (
        <p className="vet-note" role="alert" style={{ color: "var(--danger)", gridColumn: "1 / -1" }}>
          {error}
        </p>
      ) : saved ? (
        <p className="vet-note" role="status" style={{ gridColumn: "1 / -1" }}>
          {saved} saved.
        </p>
      ) : null}
    </div>
  );
}
