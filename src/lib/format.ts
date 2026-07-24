/* Ship's-log formatting — mono caps data per the design system.
   "JUL 26 · 06:00 · 26 NM", "33.9803° N — 118.4517° W", EST. MMXXIV. */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function logDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

export function logTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function logDateTime(iso: string): string {
  return `${logDate(iso)} · ${logTime(iso)}`;
}

export function logMeta(iso: string, distanceNm?: number | null): string[] {
  const parts = [logDate(iso), logTime(iso)];
  if (distanceNm != null) parts.push(`${distanceNm} NM`);
  return parts;
}

export function price(cents: number): string {
  if (!cents) return "COMPLIMENTARY";
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
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
