/* Card chips for the public manifest — the mono data register, nothing more.
   Ship's-log values only: how long, which week of the season, how many hulls,
   what holds a pass. No ratings, no value badges, no urgency copy (see
   docs/EVENT-CARD-ENRICHMENT.md — those were rejected on brand grounds). */

import { price } from "@/lib/format";

/* One deposit figure, club-wide, rendered through price() so a zero would
   read as Complimentary rather than "$0". */
export const DEPOSIT_CENTS = 5000;
export const DEPOSIT_CHIP = `${price(DEPOSIT_CENTS)} holds it`.toUpperCase();

/* "6 HRS" — the sail's length, from cast off to alongside. */
export function durationChip(startsAt: string, endsAt: string | null): string | null {
  if (!endsAt) return null;
  const mins = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000
  );
  if (!Number.isFinite(mins) || mins <= 0) return null;
  if (mins < 60) return `${mins} MIN`;
  const hrs = mins / 60;
  const value = Number.isInteger(hrs) ? String(hrs) : hrs.toFixed(1);
  return `${value} ${hrs === 1 ? "HR" : "HRS"}`;
}

/* ISO week — the register a ship's log keeps, not a marketing countdown. */
export function weekNumber(iso: string): number {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

export function weekChip(iso: string): string {
  return `WEEK ${weekNumber(iso)}`;
}

/* "3 YACHTS · 10 PASSES EACH" — the flotilla, on Sea Days only. Falls back to
   the hull count when the boats carry different numbers. */
export function fleetChip(vessels: Array<{ capacity: number }>): string | null {
  if (vessels.length === 0) return null;
  const hulls = `${vessels.length} ${vessels.length === 1 ? "YACHT" : "YACHTS"}`;
  const capacities = new Set(vessels.map((v) => v.capacity));
  const capacity = vessels[0].capacity;
  if (capacities.size !== 1 || !capacity) return hulls;
  const passes = `${capacity} ${capacity === 1 ? "PASS" : "PASSES"}`;
  return `${hulls} · ${passes}${vessels.length > 1 ? " EACH" : ""}`;
}

/* "51 FT · 2019 · 5 CABINS · 10 PASSES" — one hull, stated plainly. */
export function vesselSpec(v: {
  lengthFt: number | null;
  year: number | null;
  cabins: number | null;
  capacity: number;
}): string {
  const parts: string[] = [];
  if (v.lengthFt != null) parts.push(`${v.lengthFt} FT`);
  if (v.year != null) parts.push(String(v.year));
  if (v.cabins != null) parts.push(`${v.cabins} ${v.cabins === 1 ? "CABIN" : "CABINS"}`);
  if (v.capacity) parts.push(`${v.capacity} ${v.capacity === 1 ? "PASS" : "PASSES"}`);
  return parts.join(" · ");
}
