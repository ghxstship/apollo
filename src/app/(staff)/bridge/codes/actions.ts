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
  if (input.kind === "amount" && input.value < 100) return { error: "An amount off needs at least a dollar." };

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

/* The tally is written by claim_promo_code when a pass actually goes aboard, so
   it should not drift — this stays as the operator's repair for when it has.
   It used to count EVERY rsvp carrying a code, waitlist and released ones
   included, which quietly deflated a spent code back under its cap and handed
   out uses that were never earned. A use is a pass aboard, on the sailing the
   code was issued for. (The old comment claimed nothing wrote the column back;
   that stopped being true.) */
export async function reconcileUses(): Promise<{ error?: string; adjusted?: number; scanned?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const [codesRes, rsvpRes] = await Promise.all([
    supabase.from("promo_codes").select("code, uses, voyage_id"),
    supabase
      .from("rsvps")
      .select("promo_code, voyage_id")
      .not("promo_code", "is", null)
      .eq("status", "aboard"),
  ]);
  if (codesRes.error || rsvpRes.error) return { error: ERR_LAND };

  const aboard = rsvpRes.data ?? [];

  let adjusted = 0;
  for (const c of codesRes.data ?? []) {
    /* A code scoped to one sailing is only spent on that sailing — the same
       test pass_price and claim_promo_code apply. */
    const real = aboard.filter(
      (r) =>
        (r.promo_code ?? "").toUpperCase() === c.code.toUpperCase() &&
        (c.voyage_id == null || r.voyage_id === c.voyage_id)
    ).length;
    if (real === c.uses) continue;
    const { error } = await supabase.from("promo_codes").update({ uses: real }).eq("code", c.code);
    if (error) return { error: ERR_LAND };
    adjusted += 1;
  }

  revalidatePath("/bridge/codes");
  return { adjusted, scanned: (codesRes.data ?? []).length };
}
