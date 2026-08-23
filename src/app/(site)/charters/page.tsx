import type { Metadata } from "next";
import { CITY_CODES, SUB_CLASSES } from "@/lib/brand";
import { EVENT_CLASS_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  DEPOSIT_CHIP,
  durationChip,
  fleetChip,
  weekChip,
} from "@/components/site/voyage-chips";
import { fleetByVoyage } from "@/components/site/voyage-data";
import { VoyageManifest, type ManifestItem } from "./manifest";

export const metadata: Metadata = {
  title: "Voyages",
  description:
    "Every Sea Day and Port Day on the season's manifest. Passes are few by design.",
};

export default async function VoyagesPage() {
  const supabase = await createClient();
  const [{ data: voyages }, { data: capacity }, { data: harbors }] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("harbors").select("*").order("position", { ascending: true }),
  ]);

  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.voyage_id, c] as const)
  );
  const harborById = new Map((harbors ?? []).map((h) => [h.id, h] as const));
  const fleets = await fleetByVoyage((voyages ?? []).map((v) => v.id));

  const items: ManifestItem[] = (voyages ?? []).map((v) => {
    const cap = capacityById.get(v.id);
    const harbor = v.harbor_id ? harborById.get(v.harbor_id) : null;
    const starts = new Date(v.starts_at);
    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      cls: v.class,
      clsLabel: EVENT_CLASS_LABEL[v.class],
      kindLabel: (v.sub_class && SUB_CLASSES[v.sub_class]?.label) || "",
      status: v.status,
      date: logDate(v.starts_at, v.time_zone),
      time: logTime(v.starts_at, v.time_zone),
      coordinates: v.coordinates,
      distance: v.distance_nm != null ? `${v.distance_nm} NM` : null,
      price: price(v.price_cents),
      passesLeft: cap?.berths_left ?? null,
      seatsWord: "passes",
      blurb: v.blurb,
      duration: durationChip(v.starts_at, v.ends_at),
      week: weekChip(v.starts_at),
      fleet: v.class === "sea" ? fleetChip(fleets.get(v.id) ?? []) : null,
      deposit: v.deposit_required ? DEPOSIT_CHIP : null,
      harborId: v.harbor_id,
      harborLabel: harbor ? CITY_CODES[harbor.slug] ?? harbor.name : null,
      monthKey: `${starts.getFullYear()}-${String(starts.getMonth() + 1).padStart(2, "0")}`,
      startsMs: starts.getTime(),
    };
  });

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The manifest</span>
        <h1>Voyages.</h1>
        <p className="ws-phead__sub">
          Every Sea Day and Port Day on the season&rsquo;s manifest. Passes are few by
          design — reserve early, arrive rested.
        </p>
      </div>
      <VoyageManifest items={items} />
    </div>
  );
}
