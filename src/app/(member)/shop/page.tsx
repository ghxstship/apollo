import type { Metadata } from "next";
import { getMember } from "../data";
import { ShopFront, type ShopOrderView, type ShopProduct } from "./shop";

export const metadata: Metadata = { title: "The Shop" };

export default async function ShopPage() {
  const { supabase, user, profile, zone } = await getMember();

  const [productsRes, ordersRes] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("shop_orders")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const products: ShopProduct[] = (productsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price_cents: p.price_cents,
    sizes: p.sizes,
    badge: p.badge,
  }));

  const orders = ordersRes.data ?? [];
  const orderIds = orders.map((o) => o.id);
  const { data: orderItems } = orderIds.length
    ? await supabase.from("shop_order_items").select("*").in("order_id", orderIds)
    : { data: [] };
  const nameOf = new Map((productsRes.data ?? []).map((p) => [p.id, p.name]));

  const orderViews: ShopOrderView[] = orders.map((o) => ({
    id: o.id,
    created_at: o.created_at,
    total_cents: o.total_cents,
    discount_cents: o.discount_cents,
    status: o.status,
    summary: (orderItems ?? [])
      .filter((oi) => oi.order_id === o.id)
      .map((oi) => `${oi.qty}× ${nameOf.get(oi.product_id) ?? "Item"}${oi.size ? ` (${oi.size})` : ""}`)
      .join(" · "),
  }));

  return (
    <div>
      <span className="mbr-eyebrow">Ship&rsquo;s stores</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        The Shop.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", marginTop: 8, maxWidth: "52ch" }}>
        Kit worth its salt. Charged to your member account; collect at the
        harbor or the next Port Day.
      </p>
      <div className="mbr-sec">
        <ShopFront zone={zone}
          products={products}
          isGlobal={profile?.tier === "global"}
          orders={orderViews}
        />
      </div>
    </div>
  );
}
