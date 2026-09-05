"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { endOfDay } from "@/lib/format";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type CodeKind = "percent" | "amount" | "comp";

/* promo_codes.kind is a check constraint on exactly these three; a value off
   the list is refused by the database with a constraint name, so it is refused
   here first in words. The remaining bounds keep an operator leaning on a key
   from meeting Postgres's own words about an integer column. */
const KINDS: readonly CodeKind[] = ["percent", "amount", "comp"];
const CODE_MAX = 32;
const NOTE_MAX = 200;
const AMOUNT_MAX_CENTS = 1_000_000;
const USES_MAX = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewCode = {
  code: string;
  kind: CodeKind;
  value: number;
  episodeId: string;
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
  if (code.length > CODE_MAX) return { error: `A code runs to ${CODE_MAX} characters.` };
  if (!/^[A-Z0-9-]+$/.test(code)) return { error: "A code is letters, numbers and hyphens — nothing a member has to hunt for on a keyboard." };
  if (!KINDS.includes(input.kind)) return { error: "Pick what the code is worth." };
  if (!Number.isFinite(input.value)) return { error: "The value takes a number." };
  if (input.kind === "percent" && (input.value < 1 || input.value > 100))
    return { error: "A percentage runs 1 to 100." };
  if (input.kind === "amount" && input.value < 100) return { error: "An amount off needs at least a dollar." };
  if (input.kind === "amount" && input.value > AMOUNT_MAX_CENTS)
    return { error: "That is over $10,000 off one pass — check the figure." };
  /* Refused below one rather than clamped up to it: the number the operator
     typed is the number the code should carry, or it is not cut. */
  const uses = Math.round(Number(input.maxUses));
  if (!Number.isFinite(uses) || uses < 1 || uses > USES_MAX)
    return { error: `Max uses runs 1 to ${USES_MAX.toLocaleString("en-US")}.` };
  if (input.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt))
    return { error: "That expiry date doesn't parse." };
  /* The form is <input type="date">, so this used to become UTC midnight:
     a code an operator cut as "expires Sep 1" died at Aug 31, 20:00 EDT —
     dead for the whole of the day it names, while the badge read it back to
     them as AUG 31, a day they never typed. Anyone redeeming on the 1st pays
     list price instead of the comp they were promised.

     An expiry date means the END of that day. Start of the next day on the
     club's clock, which is the last instant the code is still good. */
  const expiresAt = input.expiresAt ? endOfDay(input.expiresAt, CLUB_ZONE) : null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now())
    return { error: "That expiry has already passed — a code needs a day still to come." };
  /* The episode comes off a list; anything else is a stale screen, and the
     foreign key would answer it with a constraint name. */
  const episodeId = (input.episodeId ?? "").trim();
  if (episodeId && !UUID.test(episodeId)) return { error: "Pick the episode from the list." };
  const note = input.note.trim().slice(0, NOTE_MAX);

  const { error } = await supabase.from("promo_codes").insert({
    code,
    kind: input.kind,
    value: input.kind === "comp" ? 0 : Math.round(input.value),
    episode_id: episodeId || null,
    max_uses: uses,
    expires_at: expiresAt,
    note: note || null,
    active: true,
    created_by: staffId,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: "That code is already cut." };
    if (error.code === "23503") return { error: "That episode is not on the board." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function setCodeActive(code: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const target = (code ?? "").trim().toUpperCase();
  if (!target) return { error: "No such code." };
  const { data: changed, error } = await supabase.from("promo_codes").update({ active }).eq("code", target).select("code");
  if (error) return { error: ERR_LAND };
  if (!changed || changed.length === 0) return { error: "No such code." };
  return done();
}

/* The tally is written by claim_promo_code when a pass actually goes aboard, so
   it should not drift — this stays as the operator's repair for when it has.
   It used to count EVERY rsvp carrying a code, waitlist and released ones
   included, which quietly deflated a spent code back under its cap and handed
   out uses that were never earned. A use is a pass aboard, on the episode the
   code was issued for. (The old comment claimed nothing wrote the column back;
   that stopped being true.) */
export async function reconcileUses(): Promise<{ error?: string; adjusted?: number; scanned?: number; skipped?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const [codesRes, rsvpRes] = await Promise.all([
    supabase.from("promo_codes").select("code, uses, episode_id"),
    supabase
      .from("passes")
      .select("promo_code, episode_id")
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
    /* A code scoped to one episode is only spent on that episode — the same
       test pass_price and claim_promo_code apply. */
    const real = aboard.filter(
      (r) =>
        (r.promo_code ?? "").toUpperCase() === c.code.toUpperCase() &&
        (c.episode_id == null || r.episode_id === c.episode_id)
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
