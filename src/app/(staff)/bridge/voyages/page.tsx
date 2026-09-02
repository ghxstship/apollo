import type { Metadata } from "next";
import { logDateTime, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getOperator, readConditions } from "../../data";
import {
  VoyagesClient,
  type AssignedHull,
  type FormatOption,
  type ProgramOption,
  type VoyageOpsRow,
} from "./voyages-client";
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
type FormatRow = {
  slug: string;
  label: string;
  category: string;
  /* What the format files a sailing as — the value the taxonomy trigger copies
     onto every voyage filed under it. */
  experience_class: string;
  access: string;
  price_cents: number | null;
  capacity: number | null;
  requires_vetting: boolean;
  active: boolean;
};

/* The access line the picker shows beside each format — what it costs to be
   there, and how many it seats, in the words the catalogue uses. */
function accessLine(f: FormatRow): string {
  /* The catalogue renamed this value from open to bookable when Open became an
     experience class — two different facts that were reading as one word. */
  const door =
    f.access === "bookable"
      ? `bookable · ${price(f.price_cents ?? 0)}`
      : f.access === "invite"
        ? "by invitation"
        : f.access === "on_request"
          ? "on request"
          : f.access === "included"
            ? "included"
            : f.access.replaceAll("_", " ");
  const seats = f.capacity ? ` · seats ${f.capacity}` : "";
  const vetted = f.requires_vetting ? " · vetted" : "";
  return `${door}${seats}${vetted}`;
}

export default async function VoyagesOpsPage() {
  const { supabase } = await getOperator();

  const [voyagesRes, capacityRes, harborsRes, flotillaRes, fleetRes, seasonsRes, venuesRes, seriesRes, formatsRes] =
    await Promise.all([
      supabase.from("voyages").select("*").order("starts_at", { ascending: false }),
      supabase.from("voyage_capacity").select("*"),
      supabase.from("harbors").select("id, name").order("position", { ascending: true }),
      supabase.from("voyage_vessels").select("voyage_id, vessel_id, position"),
      supabase.from("vessels").select("id, name, capacity, active").order("name", { ascending: true }),
      supabase.from("seasons").select("id, title, active").order("starts_on", { ascending: false }),
      supabase.from("venues").select("id, name, active").order("name", { ascending: true }),
      supabase.from("voyage_series").select("id, title, template_voyage_id"),
      /* Retired formats ride along, marked: a voyage filed under one must not
         read as Unfiled, and the composer filters them out of a new filing. */
      moduleTables(supabase)
        .from("activity_formats")
        .select("slug, label, category, experience_class, access, price_cents, capacity, requires_vetting, active")
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

  /* A series is one template sailing cloned forward on a cadence. The
     template is the row voyage_series points at; the occurrences are the rows
     that point back. Both are marked on the board, because editing a template
     changes nothing already raised from it. */
  const voyages = must(voyagesRes);
  const occurrencesBySeries = new Map<string, number>();
  for (const v of voyages) {
    if (v.series_id) occurrencesBySeries.set(v.series_id, (occurrencesBySeries.get(v.series_id) ?? 0) + 1);
  }
  const seriesById = new Map(must(seriesRes).map((s) => [s.id, s]));
  const seriesByTemplate = new Map(must(seriesRes).map((s) => [s.template_voyage_id, s]));
  const seriesRole = (v: { id: string; series_id: string | null }): VoyageOpsRow["series"] => {
    const asTemplate = seriesByTemplate.get(v.id);
    if (asTemplate) {
      return { role: "template", title: asTemplate.title, occurrences: occurrencesBySeries.get(asTemplate.id) ?? 0 };
    }
    const asOccurrence = v.series_id ? seriesById.get(v.series_id) : null;
    if (asOccurrence) return { role: "occurrence", title: asOccurrence.title, occurrences: 0 };
    return null;
  };

  /* A sailing reads by its format's name now, the way a member reads it — so
     the board needs the catalogue's label beside every row, retired ones
     included. A slug with no row left in the catalogue keeps its slug rather
     than going blank; that is a filing an operator has to see to fix. */
  const formatRows = must(formatsRes) as FormatRow[];
  const formatLabelBySlug = new Map(formatRows.map((f) => [f.slug, f.label]));

  const rows: VoyageOpsRow[] = voyages.map((v) => {
    const c = readConditions(v.conditions);
    return {
      id: v.id,
      title: v.title,
      cls: v.class,
      subClass: v.sub_class,
      experienceClass: v.experience_class,
      kind: v.kind,
      departs: logDateTime(v.starts_at, v.time_zone),
      startsAtIso: v.starts_at,
      startsAtLocal: wallClockValue(v.starts_at, v.time_zone),
      vessels: hullsByVoyage.get(v.id)?.length ?? 0,
      hulls: hullsByVoyage.get(v.id) ?? [],
      aboard: capacity.get(v.id)?.aboard ?? 0,
      berths: v.berths_total,
      held: v.held_passes,
      price: price(v.price_cents),
      priceCents: v.price_cents,
      status: v.status,
      series: seriesRole(v),
      muster: v.muster ?? "",
      wind: c.wind ?? "",
      swell: c.swell ?? "",
      heading: c.heading ?? "",
      speed: c.speed ?? "",
      format: v.format,
      formatLabel: v.format ? (formatLabelBySlug.get(v.format) ?? v.format) : null,
      seasonId: v.season_id,
      venueId: v.venue_id,
      /* Rendered back to the harbor's wall clock, ready for the input. */
      saleOpensAtLocal: wallClockValue(v.sale_opens_at, v.time_zone),
      presaleHours: v.presale_hours,
      depositCents: v.deposit_cents,
    };
  });

  const harbors = (must(harborsRes)).map((h) => ({ value: h.id, label: h.name }));
  /* Retired seasons and venues stay in the pickers, marked, so a voyage that
     still holds one reads as what it is rather than as Unassigned. Active
     first; the composer offers only the active ones for a new filing. */
  const seasons: ProgramOption[] = (must(seasonsRes))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((s) => ({ value: s.id, label: s.active ? s.title : `${s.title} (retired)`, retired: !s.active }));
  const venues: ProgramOption[] = (must(venuesRes))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((v) => ({ value: v.id, label: v.active ? v.name : `${v.name} (retired)`, retired: !v.active }));
  const formats: FormatOption[] = formatRows.map((f) => ({
    value: f.slug,
    label: f.active ? f.label : `${f.label} (retired)`,
    retired: !f.active,
    category: f.category,
    experienceClass: f.experience_class,
    access: f.access,
    accessLine: accessLine(f),
    priceCents: f.price_cents,
    capacity: f.capacity,
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
