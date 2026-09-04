/* Sentences the public site says about the plans, derived from the rows and
   never typed as literals. Model C (2026-09-02) replaced the geography ×
   duration grid with five named plans — Access, Deck, Cabin, Owner, Founding —
   each carrying a monthly credit and a guest allowance. Three pages and one
   FAQ used to say "Global passes, two per episode"; Global is the geography
   axis now, not a plan, and two is a column. Every guest sentence reads the
   column, so a Bridge edit to guest_allowance lands on every surface at once. */

export interface PlanCopyRow {
  label: string;
  plan_type: "access" | "regional" | "national" | "global" | "guest";
  price_cents: number;
  guest_allowance: number;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/* Small counts read as words in running prose; anything past nine is a figure. */
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

/* "a", "an" is not needed here — the sentences below never start with the word. */
export function listWords(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* The guest rule, from the paid plans that are live. One allowance shared by
   every paid plan reads as the number; a spread reads as the range; no plans
   loaded (a failed read, an empty table) falls back to the sentence that is
   true regardless of the figure. */
export function guestLine(plans: PlanCopyRow[]): string {
  const paid = plans.filter((p) => p.price_cents > 0);
  const allowances = Array.from(new Set(paid.map((p) => p.guest_allowance))).sort((a, b) => a - b);
  if (allowances.length === 0) return "Guests ride on paid memberships — your plan says how many.";
  if (allowances.length === 1) {
    const n = allowances[0];
    if (n === 0) return "Passes carry no guests this season.";
    return `Guests ride on paid memberships — ${countWord(n)} per pass, named on the manifest.`;
  }
  return `Guests ride on paid memberships — ${countWord(allowances[0])} to ${countWord(allowances[allowances.length - 1])} per pass, by plan.`;
}

/* The same rule, shortened for a card or a note: "two guests per pass". */
export function guestAllowanceLabel(allowance: number): string {
  if (allowance <= 0) return "No guests";
  return `${countWord(allowance)} ${allowance === 1 ? "guest" : "guests"} per pass`;
}

/* The door's ruler: the booking guard compares tier_rank(profile.tier) against
   tier_rank(episode.min_tier), and a paid plan's plan_type is the geography
   that sets the member's tier. So "which plans may book this" is the paid
   plans whose geography ranks at or above the episode's floor — read from
   the rows rather than printed as the geography word, which reads as a plan
   name it no longer is. */
const RANK: Record<string, number> = { regional: 1, national: 2, global: 3 };

export function plansAtOrAbove(plans: PlanCopyRow[], minTier: string): string[] {
  const floor = RANK[minTier] ?? 3;
  return plans
    .filter((p) => p.price_cents > 0 && (RANK[p.plan_type] ?? 0) >= floor)
    .map((p) => p.label);
}
