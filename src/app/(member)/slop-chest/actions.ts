"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CrateLine = { productId: string; qty: number; size: string | null };
export type SlopChestResult = { error?: string };

/* Checkout runs in the database. place_shop_order prices the crate from the
   catalogue and writes the order and its items in one transaction, so nothing
   a member sends can decide what they are charged — the client sends a crate,
   never a price. Global tier's 15% comes off the tier on the record. */
export async function placeShopOrder(lines: CrateLine[]): Promise<SlopChestResult> {
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

  const { error } = await supabase.rpc("place_shop_order", { p_lines: clean });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/slop-chest");
  return {};
}

export async function requestRefund(orderId: string): Promise<SlopChestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("shop_orders")
    .update({ status: "refund_requested" })
    .eq("id", orderId)
    .eq("profile_id", user.id)
    .in("status", ["placed", "fulfilled"]);
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/slop-chest");
  return {};
}
