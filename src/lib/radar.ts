/* Radar — the aboard-only matching loop.

   Row types are declared here rather than pulled from src/lib/supabase/types.ts,
   for the reason given at the top of vetting.ts: that file is generated from the
   whole schema and two modules are writing to this database at once.

   The load-bearing fact about this module is that its actor is the PASS, not the
   person. `rsvps` is unique on (voyage, profile) and a couple is one pass, so
   "couples plot course as one pin and appear as one anchor" is a primary key
   rather than a filter a future surface can forget. Every id in this file that
   names a participant is an rsvp id. */

export interface RadarClock {
  voyage_id: string;
  opens_at: string;
  locks_at: string;
  anchors_unlock_at: string;
  anchors_expire_at: string;
  slots: number;
  settled_at: string | null;
}

export interface RadarPickRow {
  voyage_id: string;
  picker_rsvp: string;
  picked_rsvp: string;
  created_at: string;
}

export interface SharedAnchorRow {
  id: string;
  voyage_id: string;
  rsvp_a: string;
  rsvp_b: string;
  unlocked_at: string | null;
  expires_at: string;
}

/* One pin on the sweep. No distance, no ranking, no bio, no photo and no age —
   the kit is explicit that "you met them today" is the whole file, and the type
   makes that structural: there is nowhere here to put an age even if a surface
   wanted one. `couple` is what turns two people into one pin. */
export interface RadarPin {
  rsvpId: string;
  name: string;
  couple: boolean;
  plotted: boolean;
}

/* ── The clock ──────────────────────────────────────────────────────────────
   Four phases, read from the stored timestamps rather than from a time of day.
   The database stores absolute instants for the same reason this reads them: a
   sailing whose zone is corrected mid-season must not retroactively move a lock
   that already happened. */
export type RadarPhase = "before" | "open" | "locked" | "unlocked" | "expired";

export function radarPhase(clock: RadarClock | null, now = Date.now()): RadarPhase {
  if (!clock) return "before";
  const t = (iso: string) => new Date(iso).getTime();
  if (now < t(clock.opens_at)) return "before";
  if (now < t(clock.locks_at)) return "open";
  if (now < t(clock.anchors_unlock_at)) return "locked";
  if (now < t(clock.anchors_expire_at)) return "unlocked";
  return "expired";
}

/* What the phase says on the surface. Each line names the reason rather than
   describing the control: a member who cannot plot a course is told what closed
   and when, never that a button is unavailable. */
export const PHASE_LINE: Record<RadarPhase, string> = {
  before: "Radar opens at 17:15, on open water.",
  open: "Three picks before the lock.",
  locked: "Picks closed at 17:30. The log opens at 19:00.",
  unlocked: "Open your Captain's Log envelope to see who anchored.",
  expired: "The twenty-four hours are up. The contacts are gone on both sides.",
};

/* "12 MINUTES REMAINING", as the kit sets it. Whole minutes, floored, and null
   once the window has gone — a countdown that keeps counting after the lock is
   the second-worst thing this surface could do, after a countdown that
   disagrees with the lock the database is actually holding. */
export function minutesUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const left = new Date(iso).getTime() - now;
  return left > 0 ? Math.floor(left / 60_000) : null;
}

/* The anchor countdown, as hours and minutes: "23:12 LEFT". Not a friendly
   "about a day" — the kit gives a precise figure because there is no extension
   and no reminder, and a member deciding whether to write tonight needs the
   real number. */
export function anchorCountdown(expiresAt: string, now = Date.now()): string | null {
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return null;
  const mins = Math.floor(left / 60_000);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")} LEFT`;
}

/* Slots, as the kit draws them: filled, open, or locked. Three is the ceiling,
   not a target, so an open slot is rendered as "Open" and never as a prompt. */
export type SlotState = "filled" | "open" | "locked";

export interface Slot {
  index: number;
  state: SlotState;
  pin: RadarPin | null;
}

export function slotsFor(clock: RadarClock | null, plotted: RadarPin[]): Slot[] {
  const total = clock?.slots ?? 3;
  const locked = radarPhase(clock) !== "open";
  return Array.from({ length: total }, (_, i) => {
    const pin = plotted[i] ?? null;
    return {
      index: i + 1,
      state: pin ? "filled" : locked ? "locked" : "open",
      pin,
    } satisfies Slot;
  });
}

/* The other side of an anchor, in pass ids. The row is an ordered pair
   (rsvp_a < rsvp_b) matching the schema's existing idiom, so which column holds
   "you" depends on a uuid comparison and not on who picked first. */
export function otherSide(anchor: SharedAnchorRow, mine: string): string {
  return anchor.rsvp_a === mine ? anchor.rsvp_b : anchor.rsvp_a;
}

/* ── The Match Guarantee ────────────────────────────────────────────────────
   $150, and the kit's own copy for the two cases.

   The second case is a deliberate departure from the kit, and it is the only
   one in this module. The kit states one condition — "MATCH GUARANTEE · ZERO
   ANCHORS", "Auto-triggered at docking" — and its slot panel says outright that
   "Leaving slots open is a real choice, and it costs you nothing." Read
   literally, that is a $150 rebate on a $350 pass, payable to anyone who plots
   nothing: a 43% discount available by inaction, on a product whose margin
   table in operations.md assumes it is not. It would be found in one season and
   would then be the product.

   So the guarantee here covers a course plotted and not returned. A member who
   plotted nothing is told the condition in plain words rather than left to
   conclude the club broke a promise — which is the only version of this
   deviation that is defensible, and the reason the second line exists at all.
   If the club would rather honour the kit, the change is one `exists` clause in
   settle_the_match_guarantee and this constant becomes dead. */
export const MATCH_GUARANTEE_CENTS = 15_000;

/* Was "A $150 credit is already on your next sailing" — past tense, on a
   surface that has never read account_ledger and cannot. The credit is posted
   by settle_the_match_guarantee when the sailing is marked completed, which is
   after this page is ever seen. Saying "already" told a member money had moved
   at a moment when, by construction, it had not. Owed is the true tense, and
   it is no less generous. */
export const GUARANTEE_OWED_LINE =
  "That happens, and it is on us. A $150 credit goes on your account when this sailing closes — no form, no request.";

export const GUARANTEE_UNEARNED_LINE =
  "The guarantee covers a course plotted and not returned. You left all three slots open, which is a real choice and costs nothing — but there is nothing for it to cover.";

/* Whether this pass is owed the credit, by the same two conditions the database
   settles on. Duplicated deliberately and narrowly: the surface has to be able
   to say WHICH of the two applies before the sailing completes, and asking the
   ledger cannot answer a question about a payment that has not happened. The
   money itself is posted by settle_the_match_guarantee under an idem_key and
   never from here. */
export function guaranteeOwed(picksPlotted: number, anchors: number): boolean {
  return picksPlotted > 0 && anchors === 0;
}
