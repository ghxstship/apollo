/* [un] — the brand, as code. Single source for names, taxonomy, and lexicon.
   Every surface imports from here; the /brand page renders from it; the route
   audit and the e2e suite both read BANNED_TERMS out of this file by regex and
   grep rendered HTML for them, plus exclamation marks and emoji.

   Naming decisions (2026-08, [un] rebrand — see docs/brand/brand-architecture.md):
   - `[un]` is the parent brand: a bracketed anchor. The brackets are part of the
     mark and are never dropped, restyled, recoloured, or spaced out. There is no
     bracketless setting above 8 mm embroidery, which is not a thing software
     renders — so in this codebase there is no bracketless setting at all.
   - Six divisions add a sentence-case suffix one word space after the closing
     bracket: Hinged · Bound · Limited · Scripted · Cut · Brand. A division
     swaps the accent and nothing else — never type, never surfaces. One stage,
     different spotlights. [un] Brand (kit v2, 2026-08) carries no accent and no
     token at all — ink on paper, ivory on ink; it never tints a ground, a flag,
     or a rule, which is why its accent fields hold var(--text-body) rather than
     a --brand-* token: text-body IS "ink that inverts with the theme".
   - Shop is commerce, not a division — the sales channel, not the maker
     (kit v2). Lifestyle, fashion, and gear products carry the [un] Brand mark;
     event and season drops may carry their division's mark instead. Shop keeps
     its sun-orange accent and lives in COMMERCE below, not in DIVISIONS.
   - One handle across every division: @unhingedsocial.us. Divisions do not hold
     separate handles, so there is one HANDLE constant and no per-division field.
   - Retired wholesale: Syrius, SYNC, UN__, UNMOORED, Yacht Club, and the
     four-sub-brand model. All of it is in BANNED_TERMS.
   - Ops console = the Bridge · live mode = Live · feed = Open Deck
   - Credential = Member Card · commerce = the Shop · editorial = the Log
   - EVERY event is an Episode (2026-09). Not a charter, not a voyage, not an
     event: one noun, the show's own, whether it is afloat or ashore. The list
     of them is the Manifest. The written record gave up the name Episodes to
     make room and became the Log, which its own standfirst already called it.
     Charter and voyage survive ONLY as catalogue labels on two formats
     (Private charter, Theme voyage) and as database identifiers, which are
     plumbing.
   - Agent = the Producer (confirm-first; money always asks). The engine is
     Aurora, the shared ATLVS intelligence — the Producer is its [un] face;
     Aurora is never named in member-facing copy (see BANNED_TERMS).
   - The plumbing is no longer exempt. Until 2026-09-02 this file ended by
     saying that internal DB names (voyages, fathoms_ledger, wardroom_*, rsvps)
     were legacy plumbing and that display names came from here. The owner
     overturned that and asked for full alignment, so the schema was renamed to
     match: voyages became episodes, harbors became cities, activity_formats
     became series, rsvps became passes, and the stored values berth and
     chandlery became pass and shop.

     This file did NOT become redundant. It still owns capitalisation, the
     article, the plural, and every phrase a column cannot hold — Home Port is
     not home_city, The Bridge is not bridge, and Special is a word no column
     stores at all. What changed is that a reader and a query now use the same
     nouns, so the maps below are translations of case and not of meaning.

     Note for anyone running a mechanical rename again: THIS FILE MUST BE
     EXEMPT. It was included once, and the pass rewrote BANNED_TERMS itself —
     turning the entry "harbor " into "city ", which bans the very word the
     rename adopted. The gate would have failed the whole site on the new
     vocabulary. Edit it by hand. */

/* ── The anchor ─────────────────────────────────────────────────────────────
   Exported as a constant rather than typed at each call site so that "drop the
   brackets" is not a thing anyone can do by accident — there is no string
   literal "UN" anywhere for a well-meaning edit to land on. */
export const ANCHOR = "[un]";
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
export const DIVISION_IDS = ["hinged", "bound", "limited", "scripted", "cut", "brand"] as const;
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
  /* [un] Brand carries no hue at all and no token (brand-architecture.md, kit
     v2) — the products speak for themselves. var(--text-body) renders ink on
     paper and ivory on ink by construction, and the empty categories list keeps
     it out of every hosting map: retail hosts no experiences, so
     CATEGORY_DIVISIONS never offers it and an experience can never be filed
     under it. */
  brand: {
    suffix: "Brand",
    what: "Nautical lifestyle, fashion, and gear",
    accent: "var(--text-body)",
    accentLift: "var(--text-body)",
    accentDeep: "var(--text-body)",
    categories: [],
  },
};

/* Flat accent map, for the common case where a component has an id and wants a
   colour. Derived, not typed out again — two hand-maintained maps of the same
   five keys is how one of them ends up a division short. */
export const DIVISION_ACCENT = Object.fromEntries(
  DIVISION_IDS.map((id) => [id, DIVISIONS[id].accent]),
) as Record<DivisionId, string>;

/* Commerce. Deliberately NOT in DIVISIONS: the Shop is the sales channel, not
   the maker (kit v2) — products carry the [un] Brand mark, and an event or
   season drop may carry its division's mark instead, so anything iterating the
   divisions to render marks must not pick this up as a seventh. */
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
  /* The member's first surface. The route stays /home by the owner's decision;
     the NAME is Home Port, restored 2026-09-02 and taken back off BANNED_TERMS
     in the same pass. The nav label, the title and the h1 all read it from
     here, so there is no second place for the two words to drift apart. */
  homePort: "Home Port",
  bridge: "The Bridge",
  gateway: "Live",
  openDeck: "Open Deck",
  passbook: "Member Card",
  shoreside: "Shoreside",
  /* The written record. It gave up the name "Episodes" in Sept 2026 when every
     event became an episode — which is what its own standfirst had always
     called it: "The ship's log, published." */
  magazine: "The Log",
  /* What the club runs. One noun for the thing, and it is the show's word:
     an episode is afloat or ashore, an hour or three days, and it is always an
     episode. Charter, voyage and event are retired as display nouns. */
  episode: "Episode",
  episodes: "Episodes",
  /* The named strand an episode belongs to, and the word that replaced Format
     on 2026-09-02. Format is a production word in the same family as call
     sheet: correct back of house, wrong in front of a member. Series is the
     word a viewer already owns, it carries the promise that another one is
     coming, and it collapses two near-identical ideas — the catalogue of kinds
     and the recurrence mechanism — into the one thing they always were.
     The table is called series now too — the plumbing was aligned on the same day. */
  series: "Series",
  /* An episode belonging to no series. Television calls a one-off exactly
     this, which is why series_id staying nullable is a feature rather than a
     gap — a private charter and a founding night are both specials, and the
     card now has an honest thing to say instead of a blank. */
  special: "Special",
  agent: "The Producer",
  gangway: "The Gangway",
  shop: "The Shop",
  galley: "The Galley",
} as const;

/* The keys are account_ledger.kind and they now say what the labels say. Two of
   them used to disagree — the column stored berth and chandlery, both banned
   words, and this map quietly translated them on every render. That is the
   arrangement the owner ended on 2026-09-02: the plumbing speaks the same
   language as the page, so this map is a capitalisation table and nothing more.
   It stays because a display name is still not a column name. */
export const LEDGER_KIND: Record<string, string> = {
  pass: "Pass",
  deposit: "Deposit",
  addon: "Add-on",
  galley: "Galley",
  shop: "Shop",
  dues: "Dues",
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
  /* "Rounded" is real racing language for passing a buoy, and invisible to
     anyone who has not raced. The mark is still a mark; you earn it. */
  markVerb: "earned",
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
  /* The keys are contests.metric and they moved with the column values on
     2026-09-02: sailings became episodes and harbors became cities in the CHECK
     and in the rows. This map is what the Bridge prints in its call-a-contest
     select and in the target line, rendered unconditionally with no contest
     data at all — which is why a stale key here fails the gate rather than
     hiding until someone calls a contest. */
  episodes: "episodes",
  cities: "cities",
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

/* Event taxonomy, on two axes, because there were always two facts.

   The old shape held one: sea | port | premium, where the first two say WHERE
   and the third says HOW FAR THE CLUB GOES. Tangling them is why nothing could
   file a pool social, and why a private charter — very much afloat — was
   filed as neither sea nor port. Now:

     SETTING            where it happens. Two values, operationally load-bearing:
                        only ashore admits an unvetted guest, and hulls, weather
                        holds, flotillas and muster all apply afloat only.
     EXPERIENCE_CLASSES what kind of thing it is. Four rungs, and a format is
                        free to be afloat AND premium, or ashore AND premium.

   The Charter / Table family labels are gone with them. "Table" now means only
   the blind dinner for six, which is the one thing it always actually meant. */

export const SETTING_LABEL: Record<string, string> = {
  sea: "Afloat",
  shore: "Ashore",
  /* Legacy rows only — the class enum still carries it; nothing writes it. */
  sky: "Ashore",
};

export const EXPERIENCE_CLASS_IDS = ["open", "club", "premium", "exotic"] as const;
export type ExperienceClassId = (typeof EXPERIENCE_CLASS_IDS)[number];

export const EXPERIENCE_CLASSES: Record<ExperienceClassId, { label: string; what: string }> = {
  open: { label: "Open", what: "A member's guest may come, vetted or not" },
  club: { label: "Club", what: "The members' standard" },
  premium: { label: "Premium", what: "The boat, or the room, is yours" },
  exotic: { label: "Exotic", what: "Away from home water" },
};

/* The duration ladder keeps its three keys — they price the plans and gate the
   class ceiling — and stops printing its names. Voyage, Expedition and Odyssey
   were doing no work on screen: the real hours were always beside them, and
   calling a three-hour pool social an Odyssey is the kind of grandiosity the
   rest of this brand is careful to avoid. The key is plumbing; the label is
   what a member reads. */
export const SUB_CLASSES: Record<string, { label: string; note: string }> = {
  /* passage, not voyage: an episode cannot also be one third of its own
     duration ladder, and voyage is a retired display noun. The key reaches a
     reader in exactly one place — the refusal that tells a member their plan
     stops short capitalises it — which is why it was not exempt. */
  passage: { label: "Up to 4 hours", note: "Under 4 hours" },
  expedition: { label: "Up to 8 hours", note: "4–8 hours" },
  odyssey: { label: "Any length", note: "Over 8 hours" },
};

/* ── Series, seasons, editions ───────────────────────────────────────────────
   Settled by the owner 2026-09-02, on the Love Island model.

     SERIES   the named strand. Sandbar Social, Dinner Club. Was Format.
     EDITION  that series in one city. Sandbar Social Miami, Sandbar Social LA
              — the same series with its own cadence, capacity and crew, the
              way Love Island UK and Love Island USA are one property in two
              territories.
     SEASON   a run of episodes within one edition. Seasons belong to the
              edition, NOT to the club: Miami launched in 2026 and Chicago
              launches in 2027, so a single global season number would open the
              Chicago page on Season II with no Season I behind it. Per edition,
              both cities are honest at once.
     EPISODE  one airing. Has a date, a city, a venue, and passes.
     SPECIAL  an episode in no series. A crossing is away from home water by
              definition and a private charter has no run; neither is edition-ed.

   The city is part of the edition NAME, never a chip beside it — Love Island
   USA, not Love Island · Territory: USA. editionName is the only place that
   joins them so the two halves cannot drift apart across surfaces. */
export function editionName(series: string, city?: string | null): string {
  const s = String(series ?? "").trim();
  const c = String(city ?? "").trim();
  if (!s) return c;
  return c ? `${s} ${c}` : s;
}

/* Where the club is, as a member reads it. The harbors table holds cities —
   Miami, Los Angeles, Chicago, New York, each with a timezone and a launch
   year — and never held a dock, which is why Harbor read wrong the moment the
   club started running episodes ashore. A city has both water and streets.

   The place an episode actually happens is the VENUE (episodes.venue_id), which
   is the hospitality word and works identically for a marina and a rooftop.
   Site was considered and dropped: it duplicates venue, it collides with the
   (site) route group, and it is a production word like call sheet. */
export const PLACE = {
  market: "City",
  markets: "Cities",
  venue: "Venue",
  venues: "Venues",
} as const;

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
  /* UNSCRIPTED came off this list on 2026-09-03, by owner ruling: the hero is
     now Unscripted. Unreachable. Unforgettable.

     It was banned as one of the four retired sub-brand wordmarks, where the
     un-spaced form WAS the mark. The ordinary adjective is a different word
     doing a different job, and the gate cannot tell them apart — it matches a
     lowercase substring of visible text, so banning the mark banned the
     adjective with it.

     What is lost: the retired wordmark is no longer guarded. What still guards
     the shape is the live naming rule itself — the six divisions carry a space
     after the bracket, [un] Scripted, and the other three retired marks below
     are still refused. This one word is the trade. */
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
  /* The Lyre era minted boarding codes LS-, not LYR-. It is the prefix that was
     actually in the records — 243 outbox payloads carried it — and it was the
     one missing here, so a page could render LS-EESI-1005-0031 and both gates
     reported all clear. Proven by injecting one and watching the audit stay
     green at 533/533. */
  "LS-",
  "Strike a chord",
  "Chandlery",
  "Passbook",
  "The Booth",
  "the Booth",
  /* Home Port came off this list on 2026-09-02 — the owner restored it as the
     member page name. It was banned as a Lyre-era surface, and the era was the
     problem rather than the words. Gateway stays banned; Live is the name now.
     NOTE the rule at the top of this array: no double quotes in a comment here,
     because the extractor lifts every quoted string it finds and a quoted
     example silently becomes a banned term. This comment was written with them
     the first time and put Home Port straight back on the list. */
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
  /* Retired 2026-09-02 with the two-axis taxonomy. The filing system stopped
     being copy: a card names its format and its hours, never its class.

     NOTE the bracket and quote rule at the top of this array applies here too.
     Sea Day and Port Day are banned as prose only — the kind column still
     stores sea_day and port_day, which no rendered page prints. */
  "Sea Day",
  "Port Day",
  "Sea Days",
  "Port Days",
  "Plot Course",
  "Chief Vibe Stew",
  "Captain's Pass",
  /* Retired 2026-09-02 with the episode rename. Only the plural is banned, and
     that is deliberate: the singular survives as a catalogue label on the
     Private charter and Theme voyage formats, and the gate matches a lowercase
     substring — banning the singular would fail on the club's own products.
     Nothing renders the plural any more, so it is a clean regression alarm. */
  "Charters",
  /* Retired 2026-09-02. The harbors table holds cities and always did, so the
     word read as a dock the moment episodes started happening ashore. City is
     the market, Venue is the place.

     Only these two forms are banned, and the narrowness is the point: the bare
     singular still appears inside First League - Harborline, which is a league
     name and stays, and the gate matches a lowercase substring. Banning the
     bare word would fail the build on the club's own loyalty ladder.

     The third entry carries a trailing space and that is the whole trick: it
     catches harbor clock, harbor and league, and any other running-prose use,
     while Harborline has a letter where the space would be and passes clean.
     Sentence-final harbor. and harbor, still slip through, which is the price
     of keeping the league name legal. */
  "Harbors",
  "home harbor",
  "harbor ",
  /* Retired 2026-09-02 with the Series rename. Format is a production word in
     the same family as call sheet and a member never sees one; Series is the
     word a viewer already owns. The series table, episodes.series and
     every guard that reads them keep their names, because the gate greps
     VISIBLE TEXT only - tags and attributes are stripped before the match, so
     plumbing is structurally exempt and the bare word can be banned outright.
     Proven by the flagship catalogue blurb, which called itself the anchor
     format and rendered on two surfaces until a data migration moved it.

     THE LEADING SPACE IS LOAD-BEARING. The bare word was tried first and it
     failed the build on /vetting and /bridge/reports, neither of which says
     format anywhere — the letters sit inside the word information, which both
     pages use in their privacy copy. Conformation and reformat are the same
     trap. With the space, a standalone label still matches, because the gate
     replaces every tag with a space before it looks. */
  " format",
  /* The word order is fixed, 2026-09-02, by owner ruling: it is always Now
     casting, never the reverse. Now leads because it is the call and not a
     status field - a slate announces the state it is in before it names the
     thing, which is the register this brand is borrowing.

     A clean two-word phrase, so the correct order passes and no trailing-space
     trick is needed here. */
  "casting now",
];
