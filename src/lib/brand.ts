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

/* Mail and web domain, in one place. The club's addresses read at
   MAIL_DOMAIN; the Resend sender lives in Supabase Vault (OUTBOX_FROM) and is
   on atlvs.pro until lyre.social is registered and verified. If the wordmark
   moves, these two constants and that one Vault row are the whole migration. */
export const MAIL_DOMAIN = "lyre.social";
export const SITE_DOMAIN = "lyre.social";

export const MAILBOX = {
  shore: `shore@${MAIL_DOMAIN}`,
  crew: `crew@${MAIL_DOMAIN}`,
  press: `press@${MAIL_DOMAIN}`,
  partners: `partners@${MAIL_DOMAIN}`,
  signal: `signal@${MAIL_DOMAIN}`,
  /* Editorial submissions. "dispatch" here is the literal word for
     sending something in, not the retired brand name. */
  dispatch: `dispatch@${MAIL_DOMAIN}`,
} as const;

/* The logbook. Gamification in the club's register: a member accumulates a
   record, not a rank. Marks are permanent and personal; regattas and challenges
   are bounded and then become history. There is deliberately no all-time table.

   "Marks" rather than "Orders" because the Bridge already books Chandlery
   purchase orders, and one word cannot carry both. In navigation a mark is a
   fixed point you round on the way somewhere — which is what these are. */
export const LOGBOOK = {
  log: "The Passage Log",
  logLine: "What you have actually done, and nothing you have not.",
  marks: "Marks",
  markVerb: "rounded",
  regattas: "Regattas",
  regattaLine: "A regatta finishes. The standing is then history.",
  challenges: "Challenges",
  offers: "What Knots buy",
} as const;

export const MARK_KIND: Record<string, string> = {
  first: "A first",
  tally: "A tally",
  collection: "A collection",
};

export const CONTEST_METRIC: Record<string, string> = {
  nm: "nautical miles",
  sailings: "sailings",
  harbors: "harbors",
  vessels: "hulls",
  crew_met: "crew met",
  frames: "frames posted",
};

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
  /* The club keeps a logbook, not a scoreboard. A persistent public ranking
     tells the bottom of the roll they are losing at belonging. */
  "leaderboard",
  "Leaderboard",
];
