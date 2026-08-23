/* Ship's-log formatting — mono caps data per the design system.
   "JUL 26 · 06:00 · 26 NM", "33.9803° N — 118.4517° W", EST. MMXXIV.

   A sailing happens on its harbor's clock. Passing `zone` reads the instant
   there; omitting it falls back to the rendering machine's zone, which is only
   ever right by luck — every departure surface should pass one. */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type Zone = string | null | undefined;

function partsIn(iso: string, zone: Zone): Record<string, string> {
  const d = new Date(iso);
  if (!zone) {
    return {
      month: String(d.getMonth() + 1),
      day: String(d.getDate()),
      hour: String(d.getHours()),
      minute: String(d.getMinutes()),
    };
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
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

export function logDate(iso: string, zone?: Zone): string {
  const p = partsIn(iso, zone);
  const m = Number(p.month) - 1;
  return `${MONTHS[m] ?? "—"} ${String(Number(p.day)).padStart(2, "0")}`;
}

/* "AUG 23 · 2027" — the ship's-log date carrying its year. logDate alone drops
   it, which made a waiver signed today and valid for a year read
   "AUG 23 · UNTIL AUG 23": expiring the day it was signed. */
export function logDateYear(iso: string, zone?: Zone): string {
  return `${logDate(iso, zone)} · ${partsIn(iso, zone).year}`;
}

export function logTime(iso: string, zone?: Zone): string {
  const p = partsIn(iso, zone);
  /* Intl renders midnight as "24" under hour12:false in some engines. */
  const h = Number(p.hour) % 24;
  return `${String(h).padStart(2, "0")}:${String(Number(p.minute)).padStart(2, "0")}`;
}

export function logDateTime(iso: string, zone?: Zone): string {
  return `${logDate(iso, zone)} · ${logTime(iso, zone)}`;
}

export function logMeta(iso: string, distanceNm?: number | null, zone?: Zone): string[] {
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
