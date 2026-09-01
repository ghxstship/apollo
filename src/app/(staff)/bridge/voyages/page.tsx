import type { Metadata } from "next";
import { logDateTime, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getOperator, readConditions } from "../../data";
import { VoyagesClient, type AssignedHull, type VoyageOpsRow } from "./voyages-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Voyages" };

/* An instant, rendered back as the wall clock the harbor keeps — the value a
   <input type="datetime-local"> can hold, and the inverse of the read the
   create action performs. */
function wallClockValue(iso: string | null, zone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/* activity_formats is a module table — read through the seam, typed at the
   boundary, the way the Activity screens already read it. */
type FormatRow = { slug: string; label: string; category: string };

export default async function VoyagesOpsPage() {
  const { supabase } = await getOperator();

  const [voyagesRes, capacityRes, harborsRes, flotillaRes, fleetRes, seasonsRes, venuesRes, formatsRes] =
    await Promise.all([
      supabase.from("voyages").select("*").order("starts_at", { ascending: false }),
      supabase.from("voyage_capacity").select("*"),
      supabase.from("harbors").select("id, name").order("position", { ascending: true }),
      supabase.from("voyage_vessels").select("voyage_id, vessel_id, position"),
      supabase.from("vessels").select("id, name, capacity, active").order("name", { ascending: true }),
      supabase.from("seasons").select("id, title, active").order("starts_on", { ascending: false }),
      supabase.from("venues").select("id, name, active").order("name", { ascending: true }),
      moduleTables(supabase)
        .from("activity_formats")
        .select("slug, label, category")
        .eq("active", true)
        .order("position"),
    ]);

  const capacity = new Map(
    (must(capacityRes)).filter((c) => c.voyage_id).map((c) => [c.voyage_id as string, c])
  );

  /* Yachts assigned per voyage — the flotilla meter needs the count and the
     assignment dialog needs the rows themselves. */
  const fleet = must(fleetRes);
  const vesselName = new Map(fleet.map((v) => [v.id, v]));
  const hullsByVoyage = new Map<string, AssignedHull[]>();
  for (const vv of must(flotillaRes)) {
    const list = hullsByVoyage.get(vv.voyage_id) ?? [];
    list.push({
      vesselId: vv.vessel_id,
      name: vesselName.get(vv.vessel_id)?.name ?? "A hull off the register",
      capacity: vesselName.get(vv.vessel_id)?.capacity ?? 0,
      position: vv.position,
    });
    hullsByVoyage.set(vv.voyage_id, list);
  }
  for (const list of hullsByVoyage.values()) list.sort((a, b) => a.position - b.position);

  const rows: VoyageOpsRow[] = (must(voyagesRes)).map((v) => {
    const c = readConditions(v.conditions);
    return {
      id: v.id,
      title: v.title,
      cls: v.class,
      subClass: v.sub_class,
      kind: v.kind,
      departs: logDateTime(v.starts_at, v.time_zone),
      startsAtIso: v.starts_at,
      vessels: hullsByVoyage.get(v.id)?.length ?? 0,
      hulls: hullsByVoyage.get(v.id) ?? [],
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
      format: v.format,
      seasonId: v.season_id,
      venueId: v.venue_id,
      /* Rendered back to the harbor's wall clock, ready for the input. */
      saleOpensAtLocal: wallClockValue(v.sale_opens_at, v.time_zone),
      presaleHours: v.presale_hours,
      depositCents: v.deposit_cents,
    };
  });

  const harbors = (must(harborsRes)).map((h) => ({ value: h.id, label: h.name }));
  const seasons = (must(seasonsRes))
    .filter((s) => s.active)
    .map((s) => ({ value: s.id, label: s.title }));
  const venues = (must(venuesRes))
    .filter((v) => v.active)
    .map((v) => ({ value: v.id, label: v.name }));
  const formats = ((formatsRes.data ?? []) as FormatRow[]).map((f) => ({
    value: f.slug,
    label: `${f.label} · ${f.category}`,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Voyage operations</span>
      <h1 className="hm-h1">The board.</h1>
      <VoyagesClient
        rows={rows}
        harbors={harbors}
        seasons={seasons}
        venues={venues}
        formats={formats}
        fleet={fleet
          .filter((v) => v.active)
          .map((v) => ({ id: v.id, name: v.name, capacity: v.capacity }))}
      />
    </div>
  );
}
