"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GalleyLine = { itemId: string; qty: number };
export type GalleyResult = { error?: string };

/* Member self-order: insert the order (source 'self') plus its items.
   The house charge posts to the account ledger via DB trigger. */
export async function placeGalleyOrder(
  voyageId: string,
  lines: GalleyLine[]
): Promise<GalleyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const clean = lines
    .map((l) => ({ itemId: String(l.itemId), qty: Math.round(Number(l.qty)) }))
    .filter((l) => l.itemId && l.qty > 0 && l.qty <= 20);
  if (clean.length === 0) return { error: "Nothing in the order yet." };

  const { data: items } = await supabase
    .from("galley_items")
    .select("id,price_cents,active")
    .in("id", clean.map((l) => l.itemId));
  const priceOf = new Map((items ?? []).filter((i) => i.active).map((i) => [i.id, i.price_cents]));
  if (clean.some((l) => !priceOf.has(l.itemId))) {
    return { error: "The galley shelf changed. Reload and try again." };
  }

  const total = clean.reduce((sum, l) => sum + (priceOf.get(l.itemId) ?? 0) * l.qty, 0);

  const { data: order, error } = await supabase
    .from("galley_orders")
    .insert({ profile_id: user.id, voyage_id: voyageId, source: "self", total_cents: total })
    .select("id")
    .single();
  if (error || !order) return { error: "That didn't land. Try again." };

  const { error: itemsError } = await supabase.from("galley_order_items").insert(
    clean.map((l) => ({
      order_id: order.id,
      item_id: l.itemId,
      qty: l.qty,
      price_cents: priceOf.get(l.itemId) ?? 0,
    }))
  );
  if (itemsError) return { error: "That didn't land. Try again." };

  revalidatePath("/now");
  return {};
}
