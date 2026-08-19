"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type CodeKind = "percent" | "amount" | "comp";

export type NewCode = {
  code: string;
  kind: CodeKind;
  value: number;
  voyageId: string;
  maxUses: number;
  expiresAt: string;
  note: string;
};

function done(): ActionResult {
  revalidatePath("/bridge/codes");
  return {};
}

export async function createCode(input: NewCode): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const code = input.code.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { error: "A code needs characters." };
  if (input.kind === "percent" && (input.value < 1 || input.value > 100))
    return { error: "A percentage runs 1 to 100." };
  if (input.kind === "amount" && input.value < 1) return { error: "An amount off needs dollars." };

  const { error } = await supabase.from("promo_codes").insert({
    code,
    kind: input.kind,
    value: input.kind === "comp" ? 0 : Math.round(input.value),
    voyage_id: input.voyageId || null,
    max_uses: Math.max(1, Math.round(input.maxUses)),
    expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    note: input.note.trim() || null,
    active: true,
    created_by: staffId,
  });
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "That code is already cut." : ERR_LAND };
  }
  return done();
}

export async function setCodeActive(code: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("promo_codes").update({ active }).eq("code", code);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Redemption runs through check_promo, which reads and never writes back, so
   the uses column drifts from the truth. The truth is the passes: recount the
   passes carrying each code and set the tally to match. */
export async function reconcileUses(): Promise<{ error?: string; adjusted?: number; scanned?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const [codesRes, rsvpRes] = await Promise.all([
    supabase.from("promo_codes").select("code, uses"),
    supabase.from("rsvps").select("promo_code").not("promo_code", "is", null),
  ]);
  if (codesRes.error || rsvpRes.error) return { error: ERR_LAND };

  const counted = new Map<string, number>();
  for (const r of rsvpRes.data ?? []) {
    const key = (r.promo_code ?? "").toUpperCase();
    if (!key) continue;
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }

  let adjusted = 0;
  for (const c of codesRes.data ?? []) {
    const real = counted.get(c.code.toUpperCase()) ?? 0;
    if (real === c.uses) continue;
    const { error } = await supabase.from("promo_codes").update({ uses: real }).eq("code", c.code);
    if (error) return { error: ERR_LAND };
    adjusted += 1;
  }

  revalidatePath("/bridge/codes");
  return { adjusted, scanned: (codesRes.data ?? []).length };
}
