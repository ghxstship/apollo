"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* Records what a city's tax treatment IS, once somebody qualified has said so.
   Nothing here computes a rate or guesses one; the row is a determination
   and it carries the name of the person who made it and the date. A rate with
   registered = false charges nothing — the club is not entitled to collect
   tax it is not registered for — and the console says so. */
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
  if (!/^[0-9a-f-]{36}$/.test(cityId)) return { error: ERR_LAND };

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
  if (patch.determined_on && !/^\d{4}-\d{2}-\d{2}$/.test(patch.determined_on)) {
    return { error: "The date is YYYY-MM-DD." };
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
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/tax");
  return {};
}
