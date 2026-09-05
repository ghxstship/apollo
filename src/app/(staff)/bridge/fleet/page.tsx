import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { lastChanges } from "../audit-line";
import { FleetClient, type CityCard, type VesselCard } from "./fleet-client";

export const metadata: Metadata = { title: "Fleet" };

/* Cities and hulls, editable. Both tables were read everywhere and written
   nowhere in the application — a new city or a corrected capacity was a
   migration against production. Program already does seasons, venues and
   editions this way; this is the same shape for the two tables underneath
   them. */
export default async function FleetPage() {
  const { supabase } = await getOperator();
  const [citiesRes, vesselsRes, changed] = await Promise.all([
    supabase.from("cities").select("*").order("position"),
    supabase.from("vessels").select("*").order("active", { ascending: false }).order("name"),
    lastChanges(supabase, ["cities", "vessels"]),
  ]);
  const cities: CityCard[] = must(citiesRes).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    timeZone: c.time_zone,
    coordinates: c.coordinates ?? "",
    launchYear: c.launch_year === null ? "" : String(c.launch_year),
    position: String(c.position),
    changed: changed.get(`cities:${c.id}`) ?? null,
  }));
  const vessels: VesselCard[] = must(vesselsRes).map((v) => ({
    id: v.id,
    name: v.name,
    capacity: String(v.capacity),
    homeCity: v.home_city ?? "",
    dayRate: v.day_rate_cents === null ? "" : (v.day_rate_cents / 100).toFixed(2),
    lengthFt: v.length_ft === null ? "" : String(v.length_ft),
    year: v.year === null ? "" : String(v.year),
    cabins: v.cabins === null ? "" : String(v.cabins),
    active: v.active,
    changed: changed.get(`vessels:${v.id}`) ?? null,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Fleet</span>
      <h1 className="hm-h1">The cities, and the hulls that sail from them.</h1>
      <p className="hm-lede">
        A city is a market with a clock: every departure on the manifest reads in
        its time zone, and its status is the badge the home page shows. A hull
        carries the capacity the ratio caps and the fill figures count, and a day
        rate the P&amp;L reads once the charter contract sets one.
      </p>
      <FleetClient cities={cities} vessels={vessels} />
    </div>
  );
}
