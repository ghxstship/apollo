/* Show — the crew's operating surface: the bridge board, the deck-state signal
   flags, the Confessional Pod queue, and the two classification axes.

   Row types are declared here rather than pulled from src/lib/supabase/types.ts,
   for the reason given at the top of vetting.ts.

   The Five-A phases and the weather classes already exist as types in
   src/types/elements.ts, which is the element schema as code. They are imported
   rather than restated: a second copy of a five-value union is how one of them
   ends up a phase short. */

import {
  FIVE_A_LABEL,
  FIVE_A_PHASES,
  WEATHER_CLASSES,
  type FiveAPhase,
  type WeatherClass,
} from "@/types/elements";

export { FIVE_A_LABEL, FIVE_A_PHASES, WEATHER_CLASSES };
export type { FiveAPhase, WeatherClass };

/* ── Deck states ────────────────────────────────────────────────────────────
   Four nautical signal flags, one flying at a time. A single-valued column in
   the database, so "one at a time" is the shape of the data rather than a rule
   someone has to remember.

   Modelled here with GEOMETRY, not colour: the kit's rule is "GEOMETRY CARRIES
   THE MEANING, NEVER A DIVISION HUE", and three of the four flags are drawn in
   pure ink and bone. STAND BY is the exception and takes --caution, which
   brand-architecture.md names as the one override permitted over an identity
   accent — because it is a safety state, and the amber is doing the work of the
   word rather than decorating it. */
export const DECK_STATES = ["underway", "anchored", "stand_by", "ceremony"] as const;
export type DeckState = (typeof DECK_STATES)[number];

export interface DeckFlag {
  readonly label: string;
  /** What the flag declares, in the crew's own words from the kit. */
  readonly says: string;
  /** The mark drawn on the field. Read by the flag component; there is no hue
      prop, so a division accent is not expressible. */
  readonly mark: "square" | "band" | "triangle" | "diagonal";
  /** Inverted field — bone on ink rather than ink on bone. */
  readonly inverse: boolean;
  /** The one sanctioned status override, for the safety state only. */
  readonly caution: boolean;
}

export const DECK_FLAGS: Record<DeckState, DeckFlag> = {
  underway: {
    label: "UNDERWAY",
    says: "Making way. Bar open, Pod open.",
    mark: "square",
    inverse: false,
    caution: false,
  },
  anchored: {
    label: "ANCHORED",
    says: "Sandbar. Swim perimeter live.",
    mark: "band",
    inverse: true,
    caution: false,
  },
  stand_by: {
    label: "STAND BY",
    says: "Weather or safety hold. Listen for crew.",
    mark: "triangle",
    inverse: false,
    caution: true,
  },
  ceremony: {
    label: "CEREMONY",
    says: "Radar open. Picks close at 17:30.",
    mark: "diagonal",
    inverse: false,
    caution: false,
  },
};

/* ── The pod queue ──────────────────────────────────────────────────────────
   Five states. The kit draws four badges — RECORDING, READY, BLUR REQUESTED,
   VIP PRIORITY — but two of those are not the same kind of thing: BLUR
   REQUESTED and VIP PRIORITY are flags on a row, not positions in a queue, and
   collapsing them into the state would make a guest who asked for anonymity
   unable to also be "recording". So the state machine is the five below and the
   two flags are booleans, which is also how the database holds them. */
export const POD_STATES = ["waiting", "ready", "recording", "done", "skipped"] as const;
export type PodState = (typeof POD_STATES)[number];

export const POD_LABEL: Record<PodState, string> = {
  waiting: "WAITING",
  ready: "READY",
  recording: "RECORDING",
  done: "DONE",
  skipped: "SKIPPED",
};

export const POD_TONE: Record<PodState, string> = {
  waiting: "var(--text-faint)",
  ready: "var(--positive)",
  recording: "var(--danger)",
  done: "var(--text-muted)",
  skipped: "var(--text-faint)",
};

/** Ninety seconds, and the database will not store a longer one. */
export const POD_MAX_SECONDS = 90;

/* ── The weather substitution table ─────────────────────────────────────────
   "A hold does not cancel a phase — it swaps the element." */
export const WEATHER_TONE: Record<WeatherClass, string> = {
  waterproof_marine: "var(--positive)",
  all_weather: "var(--caution)",
  indoor_only: "var(--danger)",
};

export const WEATHER_LINE: Record<WeatherClass, string> = {
  waterproof_marine: "Full salt, spray, and sun. Default for anything aboard or at the sandbar.",
  all_weather: "Durable, not submersible. On deck under canopy; struck before a passage.",
  indoor_only: "Pod, lounge, or venue only. Needs a named substitute to exist.",
};

/* ── Rows ───────────────────────────────────────────────────────────────────
   Only the columns these surfaces read. */
export interface RunOfShowRow {
  id: string;
  voyage_id: string;
  position: number;
  window_start: string;
  window_end: string | null;
  stage: string;
  cue: string;
  staff_lead: string | null;
  sound: string | null;
  bpm: number | null;
  five_a: FiveAPhase | null;
  critical_path: boolean;
}

export interface PodSessionRow {
  id: string;
  voyage_id: string;
  rsvp_id: string;
  position: number;
  state: PodState;
  blur_required: boolean;
  vip_priority: boolean;
  duration_s: number | null;
}

export interface ElementRow {
  id: string;
  element_id: string;
  urid: string;
  name: string;
  department: string;
  five_a: FiveAPhase;
  weather: WeatherClass;
  element_state: string;
  critical_path: number;
  total_cost_usd: number | null;
}

/* ── The board ──────────────────────────────────────────────────────────────
   Times come out of Postgres as `time`, i.e. "11:00:00". The board is read on a
   wet deck at a glance and the seconds are noise, so they are cut here rather
   than in each cell. An open-ended window ("19:00–late") has no end and prints
   as the start alone — the kit's last row does exactly that, and inventing a
   closing time for Shore Leave would be inventing an operational fact. */
export function boardWindow(start: string, end: string | null): string {
  const hm = (t: string) => t.slice(0, 5);
  return end ? `${hm(start)}–${hm(end)}` : `${hm(start)} on`;
}

/* "CP marks critical path — the episode cannot proceed without it."
   Reported, never enforced: a trigger refusing an episode's departure because a
   critical-path element is still Draft would strand a real boat at a real dock
   over a procurement record. The board shows the gap; a person decides. */
export function criticalPathGaps(rows: RunOfShowRow[]): RunOfShowRow[] {
  return rows.filter((r) => r.critical_path);
}

/* A phase with no elements is a gap, and it is only detectable because every
   element declares exactly one phase. Returns the empty phases in arc order. */
export function uncoveredPhases(elements: Pick<ElementRow, "five_a">[]): FiveAPhase[] {
  const seen = new Set(elements.map((e) => e.five_a));
  return FIVE_A_PHASES.filter((p) => !seen.has(p));
}
