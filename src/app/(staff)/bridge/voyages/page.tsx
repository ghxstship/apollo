import type { Metadata } from "next";
import { logDateTime, price } from "@/lib/format";
import { getOperator, readConditions } from "../../data";
import { VoyagesClient, type VoyageOpsRow } from "./voyages-client";

export const metadata: Metadata = { title: "Voyages" };

export default async function VoyagesOpsPage() {
  const { supabase } = await getOperator();

  const [voyagesRes, capacityRes, harborsRes, flotillaRes] = await Promise.all([
    supabase.from("voyages").select("*").order("starts_at", { ascending: false }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("harbors").select("id, name").order("position", { ascending: true }),
    supabase.from("voyage_vessels").select("voyage_id"),
  ]);

  const capacity = new Map(
    (capacityRes.data ?? []).filter((c) => c.voyage_id).map((c) => [c.voyage_id as string, c])
  );

  /* Yachts assigned per voyage — the flotilla meter needs the count. */
  const vesselCount = new Map<string, number>();
  for (const vv of flotillaRes.data ?? []) {
    vesselCount.set(vv.voyage_id, (vesselCount.get(vv.voyage_id) ?? 0) + 1);
  }

  const rows: VoyageOpsRow[] = (voyagesRes.data ?? []).map((v) => {
    const c = readConditions(v.conditions);
    return {
      id: v.id,
      title: v.title,
      cls: v.class,
      subClass: v.sub_class,
      kind: v.kind,
      departs: logDateTime(v.starts_at),
      startsAtIso: v.starts_at,
      vessels: vesselCount.get(v.id) ?? 0,
      aboard: capacity.get(v.id)?.aboard ?? 0,
      berths: v.berths_total,
      held: v.held_passes,
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
