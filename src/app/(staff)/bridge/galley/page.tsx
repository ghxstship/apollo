import type { Metadata } from "next";
import { getOperator } from "../../data";
import { PosClient, type PosItem } from "./pos-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Galley POS" };

export default async function GalleyPage() {
  const { supabase } = await getOperator();

  const itemsRes = await supabase
    .from("galley_items")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  const items: PosItem[] = must(itemsRes).map((i) => ({
    id: i.id,
    category: i.category,
    name: i.name,
    priceCents: i.price_cents,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Galley POS</span>
      <h1 className="hm-h1">The register.</h1>
      <p className="hm-lede">
        Ring it, attach the member, settle to the account or record the till. Charges land on the
        ship&apos;s record.
      </p>
      <PosClient items={items} />
    </div>
  );
}
