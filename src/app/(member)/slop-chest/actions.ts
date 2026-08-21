"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CrateLine = { productId: string; qty: number; size: string | null };
export type SlopChestResult = { error?: string };

/* Checkout: insert the order + items; the DB trigger charges the member
   account. Global tier takes 15% off — computed and stored server-side. */
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
    .filter((l) => l.productId && l.qty > 0 && l.qty <= 20);
  if (clean.length === 0) return { error: "The crate is empty." };

  const [{ data: products }, { data: profile }] = await Promise.all([
    supabase
      .from("products")
      .select("id,price_cents,sizes,active")
      .in("id", clean.map((l) => l.productId)),
    supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle(),
  ]);

  const byId = new Map((products ?? []).filter((p) => p.active).map((p) => [p.id, p]));
  for (const l of clean) {
    const p = byId.get(l.productId);
    if (!p) return { error: "The shelf changed. Reload and try again." };
    if (p.sizes.length > 0 && (!l.size || !p.sizes.includes(l.size))) {
      return { error: "Pick a size first." };
    }
    if (p.sizes.length === 0) l.size = null;
  }

  const subtotal = clean.reduce(
    (sum, l) => sum + (byId.get(l.productId)?.price_cents ?? 0) * l.qty,
    0
  );
  const discount = profile?.tier === "global" ? Math.round(subtotal * 0.15) : 0;

  const { data: order, error } = await supabase
    .from("shop_orders")
    .insert({
      profile_id: user.id,
      // Gross total; the ledger trigger charges total minus discount.
      total_cents: subtotal,
      discount_cents: discount,
    })
    .select("id")
    .single();
  if (error || !order) return { error: "That didn't land. Try again." };

  const { error: itemsError } = await supabase.from("shop_order_items").insert(
    clean.map((l) => ({
      order_id: order.id,
      product_id: l.productId,
      qty: l.qty,
      size: l.size,
      price_cents: byId.get(l.productId)?.price_cents ?? 0,
    }))
  );
  if (itemsError) return { error: "That didn't land. Try again." };

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
  if (error) return { error: "That didn't land. Try again." };

  revalidatePath("/slop-chest");
  return {};
}
