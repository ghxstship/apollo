/* [UN] — the brand, as code. Single source for names, taxonomy, and lexicon.
   Every surface imports from here; the /brand page renders from it; the route
   audit and the e2e suite both read BANNED_TERMS out of this file by regex and
   grep rendered HTML for them, plus exclamation marks and emoji.

   Naming decisions (2026-08, [UN] rebrand — see docs/brand/brand-architecture.md):
   - `[UN]` is the parent brand: a bracketed anchor. The brackets are part of the
     mark and are never dropped, restyled, recoloured, or spaced out. There is no
     bracketless setting above 8 mm embroidery, which is not a thing software
     renders — so in this codebase there is no bracketless setting at all.
   - Five divisions add a sentence-case suffix one word space after the closing
     bracket: Hinged · Bound · Limited · Scripted · Cut. A division swaps the
     accent and nothing else — never type, never surfaces. One stage, different
     spotlights.
   - Shop is commerce, not a division. It carries whichever division's mark the
     drop belongs to and has no mark of its own, which is why it lives in
     COMMERCE below and not in DIVISIONS.
   - One handle across every division: @unhingedsocial.us. Divisions do not hold
     separate handles, so there is one HANDLE constant and no per-division field.
   - Retired wholesale: Syrius, SYNC, UN__, UNMOORED, Yacht Club, and the
     four-sub-brand model. All of it is in BANNED_TERMS.
   - Ops console = the Bridge · live mode = Live · feed = Open Deck
   - Credential = Member Card · commerce = the Shop · editorial = Episodes
   - Agent = the Producer (confirm-first; money always asks). The engine is
     Aurora, the shared ATLVS intelligence — the Producer is its [UN] face;
     Aurora is never named in member-facing copy (see BANNED_TERMS).
   - Internal DB names (voyages, fathoms_ledger, wardroom_*, rsvps…) are legacy
     plumbing; display names come from here. */

/* ── The anchor ─────────────────────────────────────────────────────────────
   Exported as a constant rather than typed at each call site so that "drop the
   brackets" is not a thing anyone can do by accident — there is no string
   literal "UN" anywhere for a well-meaning edit to land on. */
export const ANCHOR = "[UN]";
export const BRAND = ANCHOR;
export const WORDMARK = ANCHOR;

/* The one setting where the brackets come off. brand-architecture.md permits
   plain UNHINGED in body copy, headlines and legal text where brackets would
   disrupt reading — but never in anything that FUNCTIONS as a logo: lockups,
   signage, avatars, covers, footers, packaging. If you are reaching for this in
   a header or a footer, you want ANCHOR. */
export const BRAND_PLAIN = "UNHINGED";

/* The parent slogan, set as a mark. The blank is the brand, so the blank gets
   set like one — lowercase, always, in mono. It is not a sentence and takes no
   full stop.

   Every handoff template used to carry "The Unscripted Social Experiment for
   Singles" instead, which is a RETIRED tagline and is banned below — so the
   design-system document the branch was built from would have failed this
   repo's own brand audit. Confirmed by the owner 2026-08-25: the tagline is
   this one, and the retired phrase stays banned. The templates were corrected
   to match; the ban was not lifted. */
export const TAGLINE = "anything goes here";

/* One handle everywhere. A division that wants its own is asking to split the
   recognition five ways. */
export const HANDLE = "@unhingedsocial.us";

/* ── Divisions ──────────────────────────────────────────────────────────────
   The tuple is the enum. Deriving DivisionId from it means a new division
   cannot be added to one map and forgotten in the next — Record<DivisionId, …>
   fails the build until every map covers it. */
export const DIVISION_IDS = ["hinged", "bound", "limited", "scripted", "cut"] as const;
export type DivisionId = (typeof DIVISION_IDS)[number];

/* Activity categories. Every experience is filed under one, and the category
   determines which divisions may host it. */
export const ACTIVITY_CATEGORIES = ["sea", "port", "premium"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export interface Division {
  /** Sentence-case suffix, as it is set in the lockup. */
  readonly suffix: string;
  /** What the division is, in one line, sentence case. */
  readonly what: string;
  /** Identity accent. A token reference, never a hex — the hex belongs to
      tokens.css and a copy of it here is a second source of truth that drifts. */
  readonly accent: string;
  /** Text-safe step for small type on ink. */
  readonly accentLift: string;
  /** Text-safe step for small type on paper grounds. */
  readonly accentDeep: string;
  readonly categories: readonly ActivityCategory[];
}

export const DIVISIONS: Record<DivisionId, Division> = {
  hinged: {
    suffix: "Hinged",
    what: "Singles social club",
    accent: "var(--brand-hinged)",
    accentLift: "var(--brand-hinged-lift)",
    accentDeep: "var(--brand-hinged-deep)",
    categories: ["sea", "port"],
  },
  bound: {
    suffix: "Bound",
    what: "Open and alternative lifestyle couples",
    accent: "var(--brand-bound)",
    accentLift: "var(--brand-bound-lift)",
    accentDeep: "var(--brand-bound-deep)",
    categories: ["port", "premium"],
  },
  limited: {
    suffix: "Limited",
    what: "Premium experiences",
    accent: "var(--brand-limited)",
    accentLift: "var(--brand-limited-lift)",
    accentDeep: "var(--brand-limited-deep)",
    categories: ["sea", "premium"],
  },
  scripted: {
    suffix: "Scripted",
    what: "Social content series",
    accent: "var(--brand-scripted)",
    accentLift: "var(--brand-scripted-lift)",
    accentDeep: "var(--brand-scripted-deep)",
    categories: ["port"],
  },
  cut: {
    suffix: "Cut",
    what: "Behind the scenes and founder-led content",
    accent: "var(--brand-cut)",
    accentLift: "var(--brand-cut-lift)",
    accentDeep: "var(--brand-cut-deep)",
    categories: ["premium"],
  },
};

/* Flat accent map, for the common case where a component has an id and wants a
   colour. Derived, not typed out again — two hand-maintained maps of the same
   five keys is how one of them ends up a division short. */
export const DIVISION_ACCENT = Object.fromEntries(
  DIVISION_IDS.map((id) => [id, DIVISIONS[id].accent]),
) as Record<DivisionId, string>;

/* Commerce and the sixth accent. Deliberately NOT in DIVISIONS: a Shop drop
   carries the mark of the division it belongs to, so anything iterating the
   divisions to render marks must not pick this up. */
export const COMMERCE = {
  shop: { label: "Shop", accent: "var(--brand-shop)" },
} as const;

/* Which divisions may host a category. The inverse of Division.categories, and
   derived from it for the same reason DIVISION_ACCENT is. */
export const CATEGORY_DIVISIONS = Object.fromEntries(
  ACTIVITY_CATEGORIES.map((c) => [c, DIVISION_IDS.filter((id) => DIVISIONS[id].categories.includes(c))]),
) as Record<ActivityCategory, DivisionId[]>;

/* ── Casing ─────────────────────────────────────────────────────────────────
   The casing matrix, as three named settings. There is no fourth: plain-sans
   lowercase is never permitted, and the way that rule is kept is that no value
   of this type produces lowercase in the sans or the mono. Lowercase is earned
   by the serif italic, and only by it.

     standard   Space Mono 700, sentence case  — the primary standard. Web
                headers, event titles, member portal UI, official collateral.
     editorial  Instrument Serif italic, lowercase — campaign headlines, film
                photo overlays, invitation copy, print posters. Never in UI,
                never in navigation.
     caps       Space Mono 700, ALL CAPS, +.06em — large physical goods only:
                screen print, embroidered cap backs, yacht flags. On screen this
                setting is wrong, and the Wordmark says so in its prop docs. */
export const LOCKUP_FORMS = ["standard", "editorial", "caps"] as const;
export type LockupForm = (typeof LOCKUP_FORMS)[number];

/* Sentence case, applied rather than assumed. A suffix arriving as "HINGED"
   from a database column or a URL segment is not a licence to set the lockup in
   caps — caps is a physical-goods setting and has to be asked for by name. */
export function sentenceCase(word: string): string {
  const s = String(word ?? "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

/* The suffix, cased for the setting it is being set in. */
export function lockupSuffix(suffix: string, form: LockupForm = "standard"): string {
  const s = String(suffix ?? "").trim();
  if (!s) return s;
  if (form === "caps") return s.toUpperCase();
  if (form === "editorial") return s.toLowerCase();
  return sentenceCase(s);
}

/* The full mark in running text. Anchor first, always; one word space; suffix
   in sentence case. Never a suffix without the anchor, and never two suffixes —
   the signature takes one optional suffix, so neither is expressible. */
export function lockup(division?: DivisionId | null, form: LockupForm = "standard"): string {
  if (!division) return ANCHOR;
  return `${ANCHOR} ${lockupSuffix(DIVISIONS[division].suffix, form)}`;
}

/* ── Surfaces and plumbing ──────────────────────────────────────────────── */

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
  shop: "The Shop",
  galley: "The Galley",
} as const;

/* account_ledger.kind keeps its legacy values (berth, chandlery) because the
   column is written by triggers all over the schema. What a member or an
   operator reads is this. */
export const LEDGER_KIND: Record<string, string> = {
  berth: "Pass",
  deposit: "Deposit",
  addon: "Add-on",
  galley: "Galley",
  chandlery: "Shop",
  credit: "Credit",
  refund: "Refund",
  payment: "Payment",
};

/* Mail and web domain, in one place. These name the club's own addresses as a
   reader sees them. The Resend sender is a separate value that lives in
   Supabase Vault (OUTBOX_FROM) and is NOT changed by editing this file —
   changing where mail actually comes from is a Vault update and a DNS
   verification, and doing it by find-and-replace is how a send starts bouncing. */
export const MAIL_DOMAIN = "unhingedsocial.us";
export const SITE_DOMAIN = "unhingedsocial.us";

/* Persisted theme preference. Named here rather than in the toggle because the
   pre-paint script in the root layout and the toggle component must read the
   same key — when they drifted, the script painted one theme and the toggle
   immediately repainted the other, on every load. */
export const THEME_STORAGE_KEY = "un-theme";

/* The founding year, in one place. The press kit's "for the record" table and
   the footer used to disagree on the same page, and this constant then settled
   it the wrong way: the club was founded in 2026, and every design-system
   handoff template said MMXXVI while this said MMXXIV. Confirmed by the owner
   2026-08-25 — 2026, so MMXXVI, and the templates were right all along. */
export const EST_YEAR_ROMAN = "MMXXVI";

/* The club's own clock, for surfaces that belong to the club rather than to a
   sailing or a member: staff screens, the public site, anything ashore. Named
   and passed explicitly rather than left to fall back, so a date on a page
   always says which clock it is on — and so a server and a browser in
   different zones can never render the same instant two ways.

   Miami, because the anchor experience is a weekly sailing out of Miami and the
   run of show is written in local time: 11:00 pre-social, 12:00 departure,
   Radar locks at 17:30. On the previous Pacific clock every one of those
   printed three hours early. */
export const CLUB_ZONE = "America/New_York";

export const MAILBOX = {
  shore: `shore@${MAIL_DOMAIN}`,
  crew: `crew@${MAIL_DOMAIN}`,
  press: `press@${MAIL_DOMAIN}`,
  partners: `partners@${MAIL_DOMAIN}`,
  signal: `signal@${MAIL_DOMAIN}`,
  casting: `casting@${MAIL_DOMAIN}`,
} as const;

/* The logbook. A member accumulates a record, not a rank. Marks are permanent;
   regattas and challenges are bounded and then become history. There is
   deliberately no all-time table — a persistent ranking tells the bottom of the
   roll they are losing at belonging. */
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

/* Event taxonomy — two families: a Charter (aboard) and a Table (ashore). Both
   run the same class ladder by duration. The theme keys are styling only. */
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

/* Terms that must not appear in rendered copy (audit-enforced, matched
   case-insensitively against the visible text of every fetched page by
   scripts/audit-routes.mjs and scripts/e2e-suite.mjs, both of which read this
   array out of this file by regex — keep it a flat array of double-quoted
   string literals or both gates silently start passing everything).

   The list inverted with the rebrand. Syrius was the brand these gates were
   written to protect; it is now the thing they are written to catch, along with
   the rest of the retired lexicon in §6 of the handoff. Every earlier ban still
   holds: a name does not become available again because a newer one retired. */
export const BANNED_TERMS = [
  // the Syrius era, wholesale
  "Syrius",
  "SYRIUS",
  "syrius.social",
  "SYR-",
  "Yacht Club",
  "Slop Chest",
  "Unscripted Social Experiment",
  /* The retired UN drafts and the four-sub-brand model.

     NOTE for whoever edits this array: no comment inside it may contain a
     closing square bracket. Both gates lift the list out of this file with a
     non-greedy regex that stops at the FIRST closing bracket it meets after the
     opening one. A bracket in a comment here truncated this list to its first
     seven entries, and both suites went on reporting a clean lexicon while
     every retired name past the seventh was unguarded. For the same reason, no
     comment in here may contain a double-quoted phrase: the extractor lifts
     every double-quoted string it finds, comments included, so a quoted example
     silently becomes a banned term. */
  "SYNC",
  "synchroni",
  "UN__",
  "UNMOORED",
  "UNBOUND",
  "UNSCRIPTED",
  "UNCUT",
  "UNHINGED Social",
  "UNHINGED Dating",
  "UNHINGED Boats",
  "UNHINGED Shop",
  // the Lyre era
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
