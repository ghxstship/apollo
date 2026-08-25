/* Vetting — the application funnel, the Preference Sheet, and the ratio gate.

   Row types are declared here rather than pulled from src/lib/supabase/types.ts.
   That file is generated wholesale from the live schema, two modules are being
   built against this database at once, and a regeneration by either of us
   rewrites every line of it — so a module that depends on it depends on the
   other module's timing. These are the columns this module reads, written down
   where this module can see them.

   Nothing here enforces anything. The caps, the head count, the clearance and
   the six-hour claim all live in the database (guard_the_ratio,
   guard_the_vetting, claim_your_place) because PostgREST is a public endpoint
   and a rule that only exists in a React component is a rule a curl request
   does not have to follow. What lives here is what a member is TOLD. */

/* ── Segments ───────────────────────────────────────────────────────────────
   The tuple is the enum, so a fourth segment cannot be added to one map and
   forgotten in the next — Record<Segment, …> fails the build until every map
   covers it. Same discipline as DIVISION_IDS in brand.ts. */
export const SEGMENTS = ["single_woman", "single_man", "couple"] as const;
export type Segment = (typeof SEGMENTS)[number];

/* The kit's own labels, from the capacity panel: "SINGLE · WOMEN", "SINGLE ·
   MEN", "COUPLES". Set in the mono label style, so they arrive already cased. */
export const SEGMENT_LABEL: Record<Segment, string> = {
  single_woman: "SINGLE · WOMEN",
  single_man: "SINGLE · MEN",
  couple: "COUPLES",
};

/* What a member picking a pass reads. Sentence case, because this is body copy
   and not a data label. */
export const SEGMENT_CHOICE: Record<Segment, string> = {
  single_woman: "A single seat, women",
  single_man: "A single seat, men",
  couple: "A couple, two seats on one pass",
};

/* Heads per unit. A couple is ONE row and TWO heads, which is the arithmetic the
   whole capacity panel turns on: the kit's specimen is 10 women + 8 men + 8
   couples = 34 of 40, and it only reaches 34 if the couples row counts double.
   The database computes this too — this copy exists so a surface can show the
   sum without asking the server to add up numbers it already has. */
export const SEGMENT_HEADS: Record<Segment, number> = {
  single_woman: 1,
  single_man: 1,
  couple: 2,
};

export function isSegment(value: unknown): value is Segment {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

/* ── Background states ──────────────────────────────────────────────────────
   Four states and the kit's own line for each, verbatim. DECLINED's line says
   what we will not do and does not say why, which is the rule: a decline is
   final and unexplained. There is no reason column in the database for a future
   surface to start rendering. */
export const BACKGROUND_STATES = ["submitted", "needs_a_call", "cleared", "declined"] as const;
export type BackgroundState = (typeof BACKGROUND_STATES)[number];

export const BACKGROUND_LABEL: Record<BackgroundState, string> = {
  submitted: "SUBMITTED",
  needs_a_call: "NEEDS A CALL",
  cleared: "CLEARED",
  declined: "DECLINED",
};

export const BACKGROUND_LINE: Record<BackgroundState, string> = {
  submitted: "With the vetting team. 48 hours.",
  needs_a_call: "A 10-minute video interview finishes it.",
  cleared: "Good for 12 months across all formats.",
  declined: "We do not explain declines, and we do not reopen them.",
};

/* Status tokens only. The kit's four state strips carry a 3px left rule in the
   state's colour and nothing else is coloured — and brand-architecture.md is
   explicit that operational state never takes a division hue, so these are the
   semantic status tokens and the greyscale, never --brand-hinged. */
export const BACKGROUND_TONE: Record<BackgroundState, string> = {
  submitted: "var(--text-faint)",
  needs_a_call: "var(--caution)",
  cleared: "var(--positive)",
  declined: "var(--danger)",
};

/* ── Boundaries ─────────────────────────────────────────────────────────────
   Part 2 of the Preference Sheet. `topic` is an open slug in the database
   because the kit draws boundaries as a list and the next sailing will add one;
   these three are the ones it draws, and "photographed" is load-bearing — the
   Confessional Pod reads it as the anonymity flag and no crew tablet can lower
   it. */
export const BOUNDARY_TOPICS = ["photographed", "confessional_pod", "seated_with_couples"] as const;
export type BoundaryTopic = (typeof BOUNDARY_TOPICS)[number];

export const BOUNDARY_LABEL: Record<BoundaryTopic, string> = {
  photographed: "Being photographed",
  confessional_pod: "Confessional Pod",
  seated_with_couples: "Being seated with couples",
};

export const STANCES = ["never", "ask_me", "happy_to"] as const;
export type Stance = (typeof STANCES)[number];

export const STANCE_LABEL: Record<Stance, string> = {
  never: "NEVER",
  ask_me: "ASK ME",
  happy_to: "HAPPY TO",
};

export const STANCE_TONE: Record<Stance, string> = {
  /* The kit sets NEVER in the radar blue rather than in danger red. A boundary
     is not an error and must not be dressed as one — red here would tell a
     member that saying no is a fault state. */
  never: "var(--grid-500)",
  ask_me: "var(--caution)",
  happy_to: "var(--positive)",
};

/* Zero proof is first in the list on purpose. The kit: "Zero proof is a
   first-class answer. The bar stocks for it and the crew never asks twice." An
   option appended last after four spirits reads as the afterthought it is
   supposed not to be. */
export const DRINKS = ["Zero proof", "Tequila", "Gin", "Wine", "Rum", "Whisky", "Beer"] as const;

/* ── Rows ───────────────────────────────────────────────────────────────────
   Only what the surfaces read. Fields the module does not use are left out
   rather than typed as unknown, so an added column is a compile error at the
   one place that starts using it. */
export interface SegmentCapacityRow {
  voyage_id: string;
  segment: Segment;
  cap: number;
  units: number;
  remaining: number;
}

export interface VettingStateRow {
  profile_id: string;
  background_state: BackgroundState;
  age_ok: boolean;
  id_verified: boolean;
  cleared_until: string | null;
  interview_at: string | null;
  fast_track: boolean;
}

export interface PreferenceSheetRow {
  profile_id: string;
  drinks: string[];
  flag_green: string | null;
  flag_red: string | null;
  completed_at: string | null;
}

export interface BoundaryRow {
  profile_id: string;
  topic: string;
  stance: Stance;
}

export interface WaitlistRow {
  id: string;
  voyage_id: string;
  segment: Segment;
  place: number;
  offered_at: string | null;
  claim_expires_at: string | null;
  claimed_at: string | null;
  released_at: string | null;
}

/* ── What the capacity panel says ───────────────────────────────────────────
   "CAPACITY IS SHOWN BY SEGMENT, NEVER AS ONE NUMBER" is the kit's standing
   rule, so there is no function here that returns one number for a sailing.
   The headline total is a sum of heads and is set BESIDE the segment rows, never
   instead of them. */
export function seatedHeads(rows: SegmentCapacityRow[]): number {
  return rows.reduce((n, r) => n + r.units * SEGMENT_HEADS[r.segment], 0);
}

export function hullHeads(rows: SegmentCapacityRow[]): number {
  return rows.reduce((n, r) => n + r.cap * SEGMENT_HEADS[r.segment], 0);
}

/* The kit's own status token: "FULL" or "2 LEFT". Never "1 seat left!" and never
   a percentage — the panel is a manifest, not a scarcity meter. */
export function remainingToken(row: SegmentCapacityRow): string {
  return row.remaining === 0 ? "FULL" : `${row.remaining} LEFT`;
}

export function isFull(row: SegmentCapacityRow): boolean {
  return row.remaining === 0;
}

/* Whether the member may still take a seat in this segment at all. A full
   segment offers the waitlist and NEVER an upsell to another segment — so this
   answers "can I buy", and the surface's only other option is the line. */
export function segmentOpen(rows: SegmentCapacityRow[], segment: Segment): boolean {
  const row = rows.find((r) => r.segment === segment);
  return !!row && row.remaining > 0;
}

/* Six hours from the offer, as a countdown the surface can print. Returns null
   when there is no live claim, so a caller cannot accidentally render "0:00
   left" at a member who was never offered anything. */
export function claimMinutesLeft(entry: WaitlistRow, now = Date.now()): number | null {
  if (!entry.claim_expires_at || entry.claimed_at || entry.released_at) return null;
  const left = new Date(entry.claim_expires_at).getTime() - now;
  return left > 0 ? Math.floor(left / 60_000) : null;
}
