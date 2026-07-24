import type { Metadata } from "next";
import { logDateTime, price } from "@/lib/format";
import { getOperator, readConditions } from "../../data";
import { VoyagesClient, type VoyageOpsRow } from "./voyages-client";

export const metadata: Metadata = { title: "Voyages" };

export default async function VoyagesOpsPage() {
  const { supabase } = await getOperator();

  const [voyagesRes, capacityRes, harborsRes] = await Promise.all([
    supabase.from("voyages").select("*").order("starts_at", { ascending: false }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("harbors").select("id, name").order("position", { ascending: true }),
  ]);

  const capacity = new Map(
    (capacityRes.data ?? []).filter((c) => c.voyage_id).map((c) => [c.voyage_id as string, c])
  );

  const rows: VoyageOpsRow[] = (voyagesRes.data ?? []).map((v) => {
    const c = readConditions(v.conditions);
    return {
      id: v.id,
      title: v.title,
      cls: v.class,
      kind: v.kind,
      departs: logDateTime(v.starts_at),
      aboard: capacity.get(v.id)?.aboard ?? 0,
      berths: v.berths_total,
      price: price(v.price_cents),
      status: v.status,
      muster: v.muster ?? "",
      wind: c.wind ?? "",
      swell: c.swell ?? "",
      heading: c.heading ?? "",
      speed: c.speed ?? "",
    };
  });

  const harbors = (harborsRes.data ?? []).map((h) => ({ value: h.id, label: h.name }));

  return (
    <div>
      <span className="hm-eyebrow">Voyage operations</span>
      <h1 className="hm-h1">The board.</h1>
      <VoyagesClient rows={rows} harbors={harbors} />
    </div>
  );
}
