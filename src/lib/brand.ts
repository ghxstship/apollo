/* LYRE SOCIAL — the brand, as code. Single source for names, taxonomy, and
   lexicon. Every surface imports from here; the /brand page renders from it;
   the route audit greps rendered HTML for BANNED terms.

   Naming decisions (2026-07):
   - Ops console = the Bridge · live mode = Gateway · feed = Open Deck
   - Currency = Knots (KN — more knots, farther) · loyalty depth = Leagues
   - Agent = Aurora AI (shared brain of the ATLVS ecosystem)
   - Credential = Passbook · main office = Shoreside · editorial = LORE
   - "dispatch" and "purser" are literal words now, never brand names.
   - Internal DB names (fathoms_ledger, wardroom_*, etc.) are legacy plumbing;
     display names come from here. */

export const TAGLINE = "Strike a chord.";

export const SURFACES = {
  homePort: "Home Port",
  bridge: "The Bridge",
  gateway: "Gateway",
  openDeck: "Open Deck",
  passbook: "Passbook",
  shoreside: "Shoreside",
  magazine: "LORE",
  agent: "Aurora AI",
  gangway: "Gangway",
  chandlery: "The Chandlery",
  galley: "The Galley",
} as const;

export const CURRENCY = {
  name: "Knots",
  singular: "knot",
  code: "KN",
  line: "More knots, farther water.",
} as const;

export const LEAGUES = [
  { league: 1, name: "First League — Harborline", months: 0 },
  { league: 2, name: "Second League — Soundings", months: 6 },
  { league: 3, name: "Third League — Blue Water", months: 12 },
  { league: 4, name: "Fourth League — Deep Water", months: 24 },
  { league: 5, name: "Fifth League — The Trench", months: 48 },
] as const;

export const CITY_CODES: Record<string, string> = {
  miami: "MIA",
  "los-angeles": "LAX",
  chicago: "CHI",
  "new-york": "NYC",
};

/* Event taxonomy — two families only: Sea Day (aboard) / Port Day (ashore).
   Both run the same class ladder by duration. "Salon" and "Overnight" are
   retired from the brand; the sky visual theme survives as styling only. */
export const CLASS_CODES: Record<string, string> = { sea: "SEA", shore: "PRT", sky: "PRT" };
export const FAMILY_LABEL: Record<string, string> = { sea: "Sea Day", shore: "Port Day", sky: "Port Day" };
export const SUB_CLASSES: Record<string, { label: string; note: string }> = {
  voyage: { label: "Voyage", note: "Under 4 hours" },
  expedition: { label: "Expedition", note: "4–8 hours" },
  odyssey: { label: "Odyssey", note: "Over 8 hours" },
};

export function knots(n: number): string {
  return `${n >= 0 ? "" : "−"}${Math.abs(n)} KN`;
}

/* Terms that must not appear in rendered copy (audit-enforced, case-insensitive).
   "purser" and "dispatch" are allowed only in literal lowercase prose; the
   audit flags the capitalized brand uses. */
export const BANNED_TERMS = [
  "Harbormaster console",
  "The Purser",
  "The Wardroom",
  "Fathoms",
  " FM ",
  "The Dispatch",
  "Shore office",
  "Member card",
  "ticket",
  "points",
  "ahoy",
  // Admission is a pass; berths are for boats. Salon triggers the wrong SEO.
  "berth",
  "Berth",
  "salon",
  "Salon",
  "Overnight",
];
