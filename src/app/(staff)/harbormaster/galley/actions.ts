"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

export type LookupResult = {
  error?: string;
  member?: { id: string; name: string; memberNo: string; tier: string };
};

export async function lookupMember(memberNo: string): Promise<LookupResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const code = memberNo.trim().toUpperCase();
  if (!code) return { error: "Key the number first." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, member_no, tier")
    .ilike("member_no", code)
    .maybeSingle();
  if (!profile) return { error: "No member under that number." };
  return {
    member: {
      id: profile.id,
      name: profile.full_name ?? "Unnamed",
      memberNo: profile.member_no ?? code,
      tier: profile.tier,
    },
  };
}

export type TicketLine = { itemId: string; qty: number; priceCents: number };

/* Settle the ticket. 'account' leaves the charge on the member account
   (the ledger trigger writes it); 'till' records the order and offsets the
   charge with a payment — net zero, memo "Paid at the till". */
export async function settleTicket(
  profileId: string,
  lines: TicketLine[],
  tender: "account" | "till"
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!profileId) return { error: "Attach a member first." };
  const clean = lines.filter((l) => l.qty > 0 && l.itemId);
  if (!clean.length) return { error: "Ring the first item — the ticket is empty." };

  const total = clean.reduce((t, l) => t + l.priceCents * l.qty, 0);

  const { data: order, error: orderError } = await supabase
    .from("galley_orders")
    .insert({ profile_id: profileId, source: "pos", total_cents: total })
    .select("id")
    .single();
  if (orderError || !order) return { error: ERR_LAND };

  const { error: itemsError } = await supabase.from("galley_order_items").insert(
    clean.map((l) => ({
      order_id: order.id,
      item_id: l.itemId,
      qty: l.qty,
      price_cents: l.priceCents,
    }))
  );
  if (itemsError) return { error: ERR_LAND };

  if (tender === "till") {
    const { error: offsetError } = await supabase.from("account_ledger").insert({
      profile_id: profileId,
      delta_cents: total,
      kind: "payment",
      memo: "Paid at the till",
      created_by: staffId,
    });
    if (offsetError) return { error: ERR_LAND };
  }

  revalidatePath("/harbormaster/galley");
  revalidatePath("/harbormaster/orders");
  return {};
}
