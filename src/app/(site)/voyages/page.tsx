import type { Metadata } from "next";
import { EVENT_CLASS_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { VoyageManifest, type ManifestItem } from "./manifest";

export const metadata: Metadata = {
  title: "Voyages",
  description:
    "Every sailing and salon on the season's manifest. Berths are few by design.",
};

export default async function VoyagesPage() {
  const supabase = await createClient();
  const [{ data: voyages }, { data: capacity }] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
    supabase.from("voyage_capacity").select("*"),
  ]);

  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.voyage_id, c] as const)
  );

  const items: ManifestItem[] = (voyages ?? []).map((v) => {
    const cap = capacityById.get(v.id);
    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      cls: v.class,
      clsLabel: EVENT_CLASS_LABEL[v.class],
      kindLabel: v.kind === "salon" ? "Salon" : "Voyage",
      status: v.status,
      date: logDate(v.starts_at),
      time: logTime(v.starts_at),
      coordinates: v.coordinates,
      distance: v.distance_nm != null ? `${v.distance_nm} NM` : null,
      price: price(v.price_cents),
      berthsLeft: cap?.berths_left ?? null,
      seatsWord: v.kind === "salon" ? "seats" : "berths",
      blurb: v.blurb,
    };
  });

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The manifest</span>
        <h1>Voyages.</h1>
        <p className="ws-phead__sub">
          Every sailing and salon on the season&rsquo;s manifest. Berths are few by
          design — reserve early, arrive rested.
        </p>
      </div>
      <VoyageManifest items={items} />
    </div>
  );
}
