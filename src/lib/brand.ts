/* SYRIUS SOCIAL — the brand, as code. Single source for names, taxonomy, and
   lexicon. Every surface imports from here; the /brand page renders from it;
   the route audit greps rendered HTML for BANNED terms and for exclamation
   marks — the producer never shouts.

   Naming decisions (2026-08, Syrius rebrand):
   - Umbrella = Syrius Social · sub-brands = Syrius Dating, Syrius Yacht Club.
     Sub-brands swap the accent only (rose / riviera) — never type or surfaces.
   - Ops console = the Bridge · live mode = Live · feed = Open Deck
     (the confession-booth motif lives in the composer voice, per the kit)
   - Credential = Member Card · shop = the Slop Chest · editorial = Episodes
   - Agent = the Producer (confirm-first; money always asks). The engine is
     Aurora, the shared ATLVS intelligence — the Producer is its Syrius face;
     Aurora is never named in member-facing copy (see BANNED_TERMS).
   - Events: Charters (aboard, Yacht Club) and Tables (ashore, Dating).
   - Carried over, kit coverage pending (docs/SYRIUS-KIT-REQUEST.md):
     Knots · Leagues · Marks · Regattas · the Passage Log · Shoreside.
   - Internal DB names (voyages, fathoms_ledger, wardroom_*, rsvps…) are legacy
     plumbing; display names come from here. */

export const BRAND = "Syrius Social";
export const WORDMARK = "SYRIUS SOCIAL";
export const TAGLINE = "The Unscripted Social Experiment.";

/* One stage, different spotlights. Sub-brands ride the event-theme system:
   data-theme="sea" is the Yacht Club's riviera, "shore" is Dating's rose. */
export const SUB_BRANDS = {
  social: { name: "Syrius Social", handle: "@syrius.social", accent: "gold" },
  dating: { name: "Syrius Dating", handle: "@syrius.dating", accent: "rose", theme: "shore" },
  yacht: { name: "Syrius Yacht Club", handle: "@syrius.yachts", accent: "riviera", theme: "sea" },
} as const;

export const SURFACES = {
  homePort: "Home",
  bridge: "The Bridge",
  gateway: "Live",
  openDeck: "Open Deck",
  passbook: "Member Card",
  shoreside: "Shoreside",
  magazine: "Episodes",
  agent: "The Producer",
  gangway: "The Gangway",
  chandlery: "The Slop Chest",
  galley: "The Galley",
} as const;

/* Mail and web domain, in one place. The show's addresses read at MAIL_DOMAIN;
   the Resend sender lives in Supabase Vault (OUTBOX_FROM) and stays on
   atlvs.pro until syrius.social is registered and verified. */
/* account_ledger.kind keeps its legacy values (berth, chandlery) because the
   column is written by triggers all over the schema. What a member or an
   operator reads is this. */
export const LEDGER_KIND: Record<string, string> = {
  berth: "Pass",
  deposit: "Deposit",
  addon: "Add-on",
  galley: "Galley",
  chandlery: "Slop Chest",
  credit: "Credit",
  refund: "Refund",
  payment: "Payment",
};

export const MAIL_DOMAIN = "syrius.social";
export const SITE_DOMAIN = "syrius.social";

/* The founding year, in one place. The press kit's "for the record" table and
   the footer used to disagree — MMXXVI against MMXXIV — on the same page. */
export const EST_YEAR_ROMAN = "MMXXIV";

export const MAILBOX = {
  shore: `shore@${MAIL_DOMAIN}`,
  crew: `crew@${MAIL_DOMAIN}`,
  press: `press@${MAIL_DOMAIN}`,
  partners: `partners@${MAIL_DOMAIN}`,
  signal: `signal@${MAIL_DOMAIN}`,
  casting: `casting@${MAIL_DOMAIN}`,
} as const;

/* The logbook. Carried over from the club era and re-voiced for the show: a
   cast member accumulates a record, not a rank. Marks are permanent; regattas
   and challenges are bounded and then become history. There is deliberately no
   all-time table — a persistent ranking tells the bottom of the roll they are
   losing at belonging. */
export const LOGBOOK = {
  log: "The Passage Log",
  logLine: "Your season, on the record.",
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
  sailings: "charters",
  harbors: "harbors",
  vessels: "hulls",
  crew_met: "cast met",
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
  mallorca: "PMI",
  ibiza: "IBZ",
};

/* Event taxonomy — two families: a Charter (aboard, Syrius Yacht Club) and a
   Table (ashore, Syrius Dating's Thursday format). Both run the same class
   ladder by duration. The sky visual theme survives as styling only. */
export const CLASS_CODES: Record<string, string> = { sea: "CHT", shore: "TBL", sky: "TBL" };
export const FAMILY_LABEL: Record<string, string> = { sea: "Charter", shore: "Table", sky: "Table" };
export const SUB_CLASSES: Record<string, { label: string; note: string }> = {
  voyage: { label: "Voyage", note: "Under 4 hours" },
  expedition: { label: "Expedition", note: "4–8 hours" },
  odyssey: { label: "Odyssey", note: "Over 8 hours" },
};

export function knots(n: number): string {
  return `${n >= 0 ? "" : "−"}${Math.abs(n)} KN`;
}

/* Terms that must not appear in rendered copy (audit-enforced, case-sensitive
   raw-HTML match). The Lyre era is fully retired; the producer never shouts,
   so the audit also scans visible text for exclamation marks and emoji. */
export const BANNED_TERMS = [
  // the retired brand, wholesale
  "Lyre",
  "LYRE",
  "lyre.social",
  "LYR-",
  "Strike a chord",
  "Chandlery",
  "Passbook",
  "The Booth",
  "the Booth",
  "Home Port",
  "Gateway",
  "LORE",
  "Aurora",
  "ATLVS",
  // pre-Syrius bans that still hold
  "Harbormaster console",
  "The Purser",
  "The Wardroom",
  "Fathoms",
  " FM ",
  "The Dispatch",
  "Shore office",
  "ticket",
  "points",
  "ahoy",
  "berth",
  "Berth",
  "salon",
  "Salon",
  "Overnight",
  "leaderboard",
  "Leaderboard",
];
