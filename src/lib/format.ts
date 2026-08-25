/* Ship's-log formatting — mono caps data per the design system.
   "JUL 26 · 06:00 · 26 NM", "33.9803° N — 118.4517° W", EST. MMXXIV.

   A sailing happens on its harbor's clock, a member reads their account on
   theirs, and the club keeps its own ashore. `zone` is REQUIRED — it used to be
   optional, falling back to whatever zone the rendering machine sat in, which
   the old comment here already called "only ever right by luck".

   Luck ran out in three places at once. On a UTC host, 19.6% of a member's
   own statement lines are dated to the wrong day on their own clock. Client
   components rendered one date on the server and another after hydration.
   And the same instant appeared as two different days on two surfaces of the
   same page.

   Required, so every call states which clock it is on. Where a surface belongs
   to the club rather than to a sailing or a member, it passes CLUB_ZONE and
   says so. */

import { CLUB_ZONE } from "./brand";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/* null is allowed and means "no clock is knowable here" — a member with no
   home harbour, for instance — and resolves to the club's own. undefined is
   not, because that is what an omitted argument looks like. */
export type Zone = string | null;

function partsIn(iso: string, zone: Zone): Record<string, string> {
  const d = new Date(iso);
  /* Never the render machine. A null zone means the caller genuinely has no
     clock for this row, and the club's own is the honest stand-in — it is at
     least a real place, and it is the same on the server and in the browser. */
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone || CLUB_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

export function logDate(iso: string, zone: Zone): string {
  const p = partsIn(iso, zone);
  const m = Number(p.month) - 1;
  return `${MONTHS[m] ?? "—"} ${String(Number(p.day)).padStart(2, "0")}`;
}

/* "AUG 23 · 2027" — the ship's-log date carrying its year. logDate alone drops
   it, which made a waiver signed today and valid for a year read
   "AUG 23 · UNTIL AUG 23": expiring the day it was signed. */
export function logDateYear(iso: string, zone: Zone): string {
  /* partsIn used to return no year at all, so this emitted
     "AUG 23 · undefined" — on /agreements, where it was added to stop a waiver
     reading as though it expired the day it was signed. A fallback so a
     missing part can never again reach a member as the word "undefined". */
  const year = partsIn(iso, zone).year ?? String(new Date(iso).getFullYear());
  return `${logDate(iso, zone)} · ${year}`;
}

export function logTime(iso: string, zone: Zone): string {
  const p = partsIn(iso, zone);
  /* Intl renders midnight as "24" under hour12:false in some engines. */
  const h = Number(p.hour) % 24;
  return `${String(h).padStart(2, "0")}:${String(Number(p.minute)).padStart(2, "0")}`;
}

export function logDateTime(iso: string, zone: Zone): string {
  return `${logDate(iso, zone)} · ${logTime(iso, zone)}`;
}

export function logMeta(iso: string, distanceNm: number | null | undefined, zone: Zone): string[] {
  const parts = [logDate(iso, zone), logTime(iso, zone)];
  if (distanceNm != null) parts.push(`${distanceNm} NM`);
  return parts;
}

export function price(cents: number): string {
  if (!cents) return "COMPLIMENTARY";
  /* Grouped: the Bridge's revenue figures reach five digits, and "$56169" is
     a number an operator has to stop and count. */
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  })}`;
}

export function fathoms(n: number): string {
  return `${n >= 0 ? "" : "−"}${Math.abs(n)} FM`;
}

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/* Two families only — the sky key survives for legacy rows, styled as Port Day. */
export const EVENT_CLASS_LABEL: Record<string, string> = {
  sea: "Sea Day",
  shore: "Port Day",
  sky: "Port Day",
};

export const TIER_LABEL: Record<string, string> = {
  regional: "Regional",
  national: "National",
  global: "Global",
};


/* The instant at which a given WALL-CLOCK time falls in a given zone.

   "18:00 the night before" is not an instant, it is a time on a wall in a
   harbour, and the two only coincide by accident. The add-on cutoff used
   `new Date(y, m, d - 1, 18)` — which reads AND writes the render machine's
   zone — so on an Eastern host it landed 21 hours late for a Pacific sailing,
   and on a UTC host it takes four hours off the window it promises for a
   morning sailing in an eastern harbour. The refusal text says "closed at 18:00
   the night before" either way.

   Two passes: guess the instant, ask the zone what wall time that actually is,
   correct by the difference. That is what makes it survive a DST change — the
   offset is read at the guessed instant rather than assumed. */
export function wallClockInZone(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute: number,
  zone: Zone
): number {
  const tz = zone || CLUB_ZONE;
  const wanted = Date.UTC(year, month1 - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess).toISOString(), tz);
    const asIfUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour) % 24,
      Number(p.minute)
    );
    guess = wanted - (asIfUtc - guess);
  }
  return guess;
}

/* 18:00 on the day before this sailing departs, on the harbour's wall. */
export function eveningBefore(iso: string, zone: Zone, hour = 18): number {
  const p = partsIn(iso, zone);
  const dayBefore = new Date(
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - 1)
  );
  return wallClockInZone(
    dayBefore.getUTCFullYear(),
    dayBefore.getUTCMonth() + 1,
    dayBefore.getUTCDate(),
    hour,
    0,
    zone
  );
}
