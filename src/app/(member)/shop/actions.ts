"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CrateLine = { productId: string; qty: number; size: string | null };
export type ShopResult = { error?: string };

/* Checkout runs in the database. place_shop_order prices the crate from the
   catalogue and writes the order and its items in one transaction, so nothing
   a member sends can decide what they are charged — the client sends a crate,
   never a price. Global tier's 15% comes off the tier on the record. */
export async function placeShopOrder(
  lines: CrateLine[],
  /* Minted once per crate and re-sent unchanged on every retry. An order is a
     charge — charge_shop_order posts the debit on AFTER INSERT — so a request
     that was charged and whose answer never came back used to cost the member
     twice when they sent the crate again. The key is how the database tells a
     resend from a second order. */
  idemKey: string
): Promise<ShopResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const clean = lines
    .map((l) => ({
      productId: String(l.productId),
      qty: Math.round(Number(l.qty)),
      size: l.size ? String(l.size) : null,
    }))
    .filter((l) => l.productId && l.qty > 0 && l.qty <= 12);
  if (clean.length === 0) return { error: "The crate is empty." };

  const { error } = await supabase.rpc("place_shop_order", {
    p_lines: clean,
    p_idem_key: idemKey,
  });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/shop");
  return {};
}

export async function requestRefund(orderId: string): Promise<ShopResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Narrowed on status, so zero rows matched is the ordinary outcome for a
     stale page — and zero rows was returning {}, which the client toasts as
     "Refund requested — the Bridge reviews it." Nobody was reviewing anything.
     A refusal that reads as success is the worst of the three outcomes. */
  const { data: asked, error } = await supabase
    .from("shop_orders")
    .update({ status: "refund_requested" })
    .eq("id", orderId)
    .eq("profile_id", user.id)
    .in("status", ["placed", "fulfilled"])
    .select("status");
  if (error) return { error: await voiceWith(supabase, error) };
  if (!asked || asked.length === 0) {
    const { data: row } = await supabase
      .from("shop_orders")
      .select("status")
      .eq("id", orderId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!row) return { error: "That order is not on your account." };
    if (row.status === "refund_requested") return { error: "That refund is already with the Bridge." };
    if (row.status === "refunded") return { error: "That one is already refunded." };
    return { error: "That order is past the point where it can be sent back." };
  }

  revalidatePath("/shop");
  return {};
}
