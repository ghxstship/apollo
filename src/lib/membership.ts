/* Membership — the credential and its lifecycle, as code.

   The membership kit carries three product economies on one artboard (a tier
   ladder, a pass list, and a table headed "four products" with five rows in
   it), and the database carries a fourth in `membership_plans`. This module
   speaks for exactly one of them: the five products operations.md §3 sells,
   which is the only one the canonical operations document agrees with. The
   other three are named where they are contradicted, never silently merged.

   Nothing here duplicates `membership_plans`. That table is thirteen live rows
   on a geography × class grid with an allowance, a class ceiling, a booking
   head start and Stripe wiring, and every function that reads it still does.
   `club_products` sits beside it and the join between them is one nullable
   column that is null on all thirteen. */

/* ── The member number ──────────────────────────────────────────────────────
   The kit sets it as "MEMBER Nº 0047" — a number and a mark, and no prefix.

   That is not a style preference here, it is the rebrand. Every member number
   in the database was minted with the retired brand's three letters in front
   of it, that string is in BANNED_TERMS, and both gates grep the visible text
   of every page for it. Before this existed, the top bar rendered the raw
   column on all sixteen member surfaces and all seventeen Bridge surfaces, and
   the lexicon check failed on every one of them.

   The DATA is not touched and must not be: fourteen members hold a number that
   is on their signed papers, in their ledger lines and in 2,535 queued letters,
   and rewriting the column would change what those records refer to. The
   prefix is a rendering, so it comes off at the render. */
const RETIRED_PREFIX = /^[A-Za-z]{2,4}[-\s]/;

export function memberNumber(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(RETIRED_PREFIX, "");
}

/* The number set the way the card sets it. Used wherever a number appears on
   its own; where it follows a label ("Member") the mark is redundant. */
export function memberMark(raw: string | null | undefined): string {
  const n = memberNumber(raw);
  return n ? `Nº ${n}` : "";
}

/* What a crew member types at the galley till is what they read off a card, and
   after the change above that is the bare digits. The lookup has to accept both
   for as long as printed cards from before the rebrand are in wallets — which
   is all of them. */
export function memberNumberCandidates(typed: string): string[] {
  const s = typed.trim().toUpperCase();
  if (!s) return [];
  const bare = memberNumber(s);
  return bare && bare !== s ? [s, bare] : [s, `%-${s}`];
}

/* ── The five products ──────────────────────────────────────────────────────
   Row shape for public.club_products. Declared here rather than in
   src/lib/supabase/types.ts because that file is generated wholesale and three
   modules are adding tables to this schema in the same week; a hand-merge of a
   generated file is a merge conflict that silently loses someone's types. */
export type ClubProductKind = "pass" | "membership" | "upgrade";

export interface ClubProduct {
  slug: string;
  label: string;
  blurb: string;
  price_cents: number | null;
  published: boolean;
  kind: ClubProductKind;
  ratio_units: number;
  ratio_heads: number;
  active_cap: number | null;
  vetting: string;
  includes: string[];
  position: number;
}

export const PRODUCT_KIND_LABEL: Record<ClubProductKind, string> = {
  pass: "One sailing",
  membership: "Standing",
  upgrade: "Add-on",
};

/* "Prices are the product, not a starting point." An unpublished product has no
   number at all — not a hidden one — so the answer in its place is a sentence
   and not a placeholder. */
export function productPrice(p: Pick<ClubProduct, "price_cents" | "published">): string {
  if (!p.published || p.price_cents == null) return "By invitation";
  return `$${(p.price_cents / 100).toLocaleString("en-US")}`;
}

/* What one of these consumes of a sailing's composition, in the two
   denominations the kit itself mixes: singles counted in heads, couples counted
   in units. Rendering only one of them is what makes "20 singles or 10 couples
   plus 10 singles" look like arithmetic instead of a contradiction. */
export function productWeight(p: Pick<ClubProduct, "ratio_units" | "ratio_heads">): string {
  if (p.ratio_units === 0 && p.ratio_heads === 0) return "Takes no place of its own";
  /* Numerals on both sides, always. Mixing a word and a figure across one rule
     ("one unit · 2 seats") is the reader's cue that the two numbers are
     different KINDS of thing, and here they are the same kind counted in two
     denominations — which is the whole point and the thing the reader has to be
     able to compare at a glance. */
  const u = `${p.ratio_units} unit${p.ratio_units === 1 ? "" : "s"}`;
  const h = `${p.ratio_heads} seat${p.ratio_heads === 1 ? "" : "s"}`;
  return `${u} · ${h}`;
}

/* ── Lifecycle ──────────────────────────────────────────────────────────────
   The kit's four states, mapped onto what the schema already holds. ACTIVE and
   PAUSED are `profiles.status`; CARD EXPIRING and LAPSED are
   `subscriptions.status`, which is empty today because nobody is paying yet.

   Lapse copy never guilts: state the deadline, state what is kept, stop
   writing. That is the kit's instruction and it is why none of these lines ask
   the member to do anything they have not already been told how to do. */
export type StandingState = "active" | "expiring" | "paused" | "lapsed" | "departed";

export const STANDING_LABEL: Record<StandingState, string> = {
  active: "Active",
  expiring: "Card expiring",
  paused: "Paused at sea",
  lapsed: "Lapsed",
  departed: "Closed",
};

export const STANDING_LINE: Record<StandingState, string> = {
  active: "Nothing to do. Dues run on the card on file.",
  expiring: "Update the card on file, or the place opens up.",
  paused: "Up to three months a year, no charge, and your number is kept.",
  lapsed: "Your number is held for 90 days. After that it goes back in the pool.",
  departed: "Your log and your ledger stay as they were. Coming back is a conversation.",
};

/* Three months a year, and the kit says so in days nowhere. 90 is the number
   the guard in the database uses, and this reads the same constant so a surface
   and a trigger cannot disagree about when a member runs out. */
export const PAUSE_DAYS_A_YEAR = 90;

/* ── The gangway's three states ─────────────────────────────────────────────
   ABOARD, HOLD, VOID — verify_member_qr() returns exactly these and no others.
   VOID is never read aloud to a line, so the copy here is written for a screen
   the crew turns away from the queue. */
export type ScanState = "aboard" | "hold" | "void";

export const SCAN_LABEL: Record<ScanState, string> = {
  aboard: "Aboard",
  hold: "Hold",
  void: "Not readable",
};

/* THE TAIL IS THE MEMBER NUMBER; the letters in front are whatever the club
   called itself when the card was printed.

   Two worktrees held contradictory answers to "where does the prefix live" and
   they share one production database: one rewrote profiles.member_no to UN- and
   renders it raw, the other left the column alone by explicit design and strips
   at render. So the till could not find a member from a card reading SYR-0034,
   from the bare 0034 its own card face shows, or from the UN-0034 now stored —
   depending which worktree answered.

   Neither answer is needed. Take the digits and match the stored value's tail,
   and the lookup survives this rebrand, the last one, and the next one.

   The tail is VALIDATED to [A-Z0-9] before it reaches a LIKE pattern. `%` and
   `_` are wildcards there, and this is operator-typed input — the same hazard
   the gangway fixed by moving off ilike, which the till never got. */
export function memberNumberTail(typed: string): string | null {
  const s = String(typed ?? "").trim().toUpperCase();
  const tail = s.includes("-") ? s.slice(s.lastIndexOf("-") + 1) : s;
  return /^[A-Z0-9]{1,12}$/.test(tail) ? tail : null;
}

/* A PostgREST `or` filter matching the number however it is stored: bare, or
   behind any prefix. Safe to interpolate because the tail is validated above. */
export function memberNumberFilter(tail: string): string {
  return `member_no.eq.${tail},member_no.like.%-${tail}`;
}
