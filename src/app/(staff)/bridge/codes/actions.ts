"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { endOfDay } from "@/lib/format";
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
    /* The form is <input type="date">, so this used to become UTC midnight:
       a code an operator cut as "expires Sep 1" died at Aug 31, 20:00 EDT —
       dead for the whole of the day it names, while the badge read it back to
       them as AUG 31, a day they never typed. Anyone redeeming on the 1st pays
       list price instead of the comp they were promised.

       An expiry date means the END of that day. Start of the next day on the
       club's clock, which is the last instant the code is still good. */
    expires_at: input.expiresAt ? endOfDay(input.expiresAt, CLUB_ZONE) : null,
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
export async function reconcileUses(): Promise<{ error?: string; adjusted?: number; scanned?: number; skipped?: number }> {
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
  /* Codes whose tally moved while we were reconciling. Reported rather than
     hidden: a reconcile that silently did less than it says is the thing an
     operator would go on to trust. */
  let skipped = 0;
  for (const c of codesRes.data ?? []) {
    /* A code scoped to one sailing is only spent on that sailing — the same
       test pass_price and claim_promo_code apply. */
    const real = aboard.filter(
      (r) =>
        (r.promo_code ?? "").toUpperCase() === c.code.toUpperCase() &&
        (c.voyage_id == null || r.voyage_id === c.voyage_id)
    ).length;
    if (real === c.uses) continue;

    /* Compare-and-swap on the tally we actually read, not a blind write.
       This loop runs sequentially over every code, so the window between the
       read at the top of this function and this write is the WHOLE reconcile,
       not microseconds. In that window: staff press Reconcile; the scan reads
       code X at 9 of 10; a member books with X and claim_promo_code atomically
       takes it to 10, spending the last one; reconcile then writes 9 back. The
       tenth use is erased and an eleventh person can redeem a ten-use code.

       refundShopOrder in this same codebase already demonstrates this pattern,
       with a comment explaining it. This was the one staff write that did not
       follow it. Zero rows matched means the tally moved under us — the count
       we computed is already stale, so leave it and let the next reconcile
       settle it against fresh numbers. */
    const { data: swapped, error } = await supabase
      .from("promo_codes")
      .update({ uses: real })
      .eq("code", c.code)
      .eq("uses", c.uses)
      .select("code");
    if (error) return { error: ERR_LAND };
    if (swapped && swapped.length > 0) adjusted += 1;
    else skipped += 1;
  }

  revalidatePath("/bridge/codes");
  return { adjusted, scanned: (codesRes.data ?? []).length, skipped };
}
