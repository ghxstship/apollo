"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* Records what a city's tax treatment IS, once somebody qualified has said so.
   Nothing here computes a rate or guesses one; the row is a determination
   and it carries the name of the person who made it and the date. A rate with
   registered = false charges nothing — the club is not entitled to collect
   tax it is not registered for — and the console says so. */

const NO_CITY = "That city is no longer on the chart — reload the page.";

const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export async function setCityTax(
  cityId: string,
  patch: {
    admissions_rate_bp: number | null;
    goods_rate_bp: number | null;
    registered: boolean;
    determined_by: string;
    determined_on: string;
    note: string;
  }
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  /* The card is one per city, so an id that is not a city is a stale screen,
     not a thing to try again. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cityId)) return { error: NO_CITY };

  /* 0–3000 basis points is this screen's bound, not the table's: city_tax
     carries no check on either rate, so a figure past it would land. Thirty
     percent is above any admissions or sales tax the club will meet. */
  for (const [label, v] of [["admissions", patch.admissions_rate_bp], ["goods", patch.goods_rate_bp]] as const) {
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v > 3000) {
      return { error: `A ${label} rate is a whole number of hundredths of a percent, 0 to 3000 — 700 is 7%.` };
    }
  }
  const by = patch.determined_by.trim().slice(0, 120);
  if ((patch.admissions_rate_bp !== null || patch.goods_rate_bp !== null) && !by) {
    return { error: "A rate needs the name of whoever determined it." };
  }
  /* Shape and calendar both: "2026-02-30" is the right shape, and the driver
     refuses it as out of range, which reaches the operator as "didn't land". */
  if (patch.determined_on && !isDay(patch.determined_on)) {
    return { error: "The date is YYYY-MM-DD, and a real day on the calendar." };
  }

  const { error } = await supabase
    .from("city_tax")
    .upsert(
      {
        city_id: cityId,
        admissions_rate_bp: patch.admissions_rate_bp,
        goods_rate_bp: patch.goods_rate_bp,
        registered: patch.registered,
        determined_by: by || null,
        determined_on: patch.determined_on || null,
        note: patch.note.trim().slice(0, 500) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "city_id" }
    );
  /* The one foreign key: a city struck between the page load and the save. */
  if (error) return { error: error.code === "23503" ? NO_CITY : ERR_LAND };
  revalidatePath("/bridge/tax");
  return {};
}
