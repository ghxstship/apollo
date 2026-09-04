"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";
import type { MembershipPlanRow } from "@/lib/supabase/types";

/* Dues could not be collected on any tier, and the reason was a null column.

   stripe_price_id and stripe_price_id_annual have existed since the billing
   migration and were never written by anything — not by a migration, not by a
   screen. Model C then retired the old plans and inserted five new ones, also
   without them. So /api/stripe/subscribe refused every tier with "Dues for
   Founding aren't running yet", including the thousand-a-month one, and the
   only way to fix it was SQL against production.

   That is what this screen is for. It is small on purpose: the price is created
   in Stripe, by a person, and this records which price a tier sells at. */

function done(): ActionResult {
  revalidatePath("/bridge/plans");
  revalidatePath("/membership");
  revalidatePath("/account");
  return {};
}

/* Stripe price ids are `price_` followed by an opaque id. Checked here because
   a typo in this field does not fail until a member tries to pay, which is the
   worst possible moment to discover it. */
const PRICE_RE = /^price_[A-Za-z0-9]+$/;

export async function setPlanPricing(
  planId: string,
  patch: {
    stripe_price_id?: string | null;
    stripe_price_id_annual?: string | null;
    monthly_credit_cents?: number;
    published?: boolean;
    price_cents?: number;
    annual_price_cents?: number | null;
    guest_allowance?: number;
  }
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const clean: Partial<MembershipPlanRow> = {};

  for (const key of ["stripe_price_id", "stripe_price_id_annual"] as const) {
    if (!(key in patch)) continue;
    const raw = (patch[key] ?? "").trim();
    if (raw === "") {
      clean[key] = null;
      continue;
    }
    if (!PRICE_RE.test(raw)) {
      return { error: "A Stripe price id looks like price_1A2b3C — check it against the dashboard." };
    }
    clean[key] = raw;
  }

  if (patch.monthly_credit_cents !== undefined) {
    const n = Math.round(patch.monthly_credit_cents);
    if (!Number.isFinite(n) || n < 0) return { error: "A credit cannot be negative." };
    clean.monthly_credit_cents = n;
  }
  if (patch.published !== undefined) clean.published = patch.published;

  /* Named guests a pass on this plan may carry. The column's CHECK is 0–6;
     the guard and the FAQ read it, so the number here is the number a member
     is quoted. */
  if (patch.guest_allowance !== undefined) {
    const n = Math.round(patch.guest_allowance);
    if (!Number.isInteger(n) || n < 0 || n > 6) return { error: "A plan carries 0 to 6 guests a pass." };
    clean.guest_allowance = n;
  }

  /* The number a member is quoted. It does not change what Stripe charges —
     that is the price object behind the id above — so the two can drift, and
     the client says so before it lets an operator save one. */
  if (patch.price_cents !== undefined) {
    const n = Math.round(patch.price_cents);
    if (!Number.isFinite(n) || n < 0) return { error: "A price cannot be negative." };
    clean.price_cents = n;
  }
  if (patch.annual_price_cents !== undefined) {
    if (patch.annual_price_cents === null) clean.annual_price_cents = null;
    else {
      const n = Math.round(patch.annual_price_cents);
      if (!Number.isFinite(n) || n < 0) return { error: "A price cannot be negative." };
      clean.annual_price_cents = n;
    }
  }

  if (Object.keys(clean).length === 0) return {};

  const { error } = await supabase.from("membership_plans").update(clean).eq("id", planId);
  if (error) return { error: ERR_LAND };
  return done();
}
