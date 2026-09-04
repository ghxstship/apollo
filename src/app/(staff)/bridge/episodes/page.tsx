import type { Metadata } from "next";
import { logDateTime, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { getOperator, readConditions } from "../../data";
import {
  EpisodesClient,
  type AssignedHull,
  type SeriesOption,
  type ProgramOption,
  type EpisodeOpsRow,
} from "./episodes-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Episodes" };

/* An instant, rendered back as the wall clock the city keeps — the value a
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

/* series is a module table — read through the seam, typed at the
   boundary, the way the Activity screens already read it. */
type SeriesRow = {
  slug: string;
  label: string;
  category: string;
  /* What the series files an episode as — the value the taxonomy trigger
     copies onto every episode filed under it. */
  experience_class: string;
  access: string;
  price_cents: number | null;
  capacity: number | null;
  requires_vetting: boolean;
  active: boolean;
};

/* The access line the picker shows beside each series — what it costs to be
   there, and how many it seats, in the words the catalogue uses. */
function accessLine(f: SeriesRow): string {
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

export default async function EpisodesOpsPage() {
  const { supabase } = await getOperator();

  const [episodesRes, capacityRes, citiesRes, flotillaRes, fleetRes, seasonsRes, venuesRes, editionsRes, seriesCatalogueRes] =
    await Promise.all([
      supabase.from("episodes").select("*").order("starts_at", { ascending: false }),
      supabase.from("episode_capacity").select("*"),
      supabase.from("cities").select("id, name").order("position", { ascending: true }),
      supabase.from("episode_vessels").select("episode_id, vessel_id, position"),
      supabase.from("vessels").select("id, name, capacity, active").order("name", { ascending: true }),
      supabase.from("seasons").select("id, title, active").order("starts_on", { ascending: false }),
      supabase.from("venues").select("id, name, active").order("name", { ascending: true }),
      supabase.from("editions").select("id, title, template_episode_id"),
      /* Retired series ride along, marked: an episode filed under one must
         not read as a Special, and the composer filters them out of a new
         filing. */
      moduleTables(supabase)
        .from("series")
        .select("slug, label, category, experience_class, access, price_cents, capacity, requires_vetting, active")
        .order("position"),
    ]);

  const capacity = new Map(
    (must(capacityRes)).filter((c) => c.episode_id).map((c) => [c.episode_id as string, c])
  );

  /* Yachts assigned per episode — the flotilla meter needs the count and the
     assignment dialog needs the rows themselves. */
  const fleet = must(fleetRes);
  const vesselName = new Map(fleet.map((v) => [v.id, v]));
  const hullsByEpisode = new Map<string, AssignedHull[]>();
  for (const vv of must(flotillaRes)) {
    const list = hullsByEpisode.get(vv.episode_id) ?? [];
    list.push({
      vesselId: vv.vessel_id,
      name: vesselName.get(vv.vessel_id)?.name ?? "A hull off the register",
      capacity: vesselName.get(vv.vessel_id)?.capacity ?? 0,
      position: vv.position,
    });
    hullsByEpisode.set(vv.episode_id, list);
  }
  for (const list of hullsByEpisode.values()) list.sort((a, b) => a.position - b.position);

  /* An edition is one template episode cloned forward on a cadence. The
     template is the row editions points at; the occurrences are the rows
     that point back. Both are marked on the board, because editing a template
     changes nothing already raised from it. */
  const episodes = must(episodesRes);
  const occurrencesByEdition = new Map<string, number>();
  for (const v of episodes) {
    if (v.edition_id) occurrencesByEdition.set(v.edition_id, (occurrencesByEdition.get(v.edition_id) ?? 0) + 1);
  }
  const editionById = new Map(must(editionsRes).map((s) => [s.id, s]));
  const editionByTemplate = new Map(must(editionsRes).map((s) => [s.template_episode_id, s]));
  const editionRole = (v: { id: string; edition_id: string | null }): EpisodeOpsRow["edition"] => {
    const asTemplate = editionByTemplate.get(v.id);
    if (asTemplate) {
      return { role: "template", title: asTemplate.title, occurrences: occurrencesByEdition.get(asTemplate.id) ?? 0 };
    }
    const asOccurrence = v.edition_id ? editionById.get(v.edition_id) : null;
    if (asOccurrence) return { role: "occurrence", title: asOccurrence.title, occurrences: 0 };
    return null;
  };

  /* An episode reads by its series' name now, the way a member reads it — so
     the board needs the catalogue's label beside every row, retired ones
     included. A slug with no row left in the catalogue keeps its slug rather
     than going blank; that is a filing an operator has to see to fix. */
  const seriesRows = must(seriesCatalogueRes) as SeriesRow[];
  const seriesLabelBySlug = new Map(seriesRows.map((f) => [f.slug, f.label]));

  const rows: EpisodeOpsRow[] = episodes.map((v) => {
    const c = readConditions(v.conditions);
    return {
      id: v.id,
      title: v.title,
      setting: v.setting,
      subClass: v.sub_class,
      experienceClass: v.experience_class,
      kind: v.kind,
      departs: logDateTime(v.starts_at, v.time_zone),
      startsAtIso: v.starts_at,
      startsAtLocal: wallClockValue(v.starts_at, v.time_zone),
      vessels: hullsByEpisode.get(v.id)?.length ?? 0,
      hulls: hullsByEpisode.get(v.id) ?? [],
      aboard: capacity.get(v.id)?.aboard ?? 0,
      passes: v.passes_total,
      held: v.held_passes,
      price: price(v.price_cents),
      priceCents: v.price_cents,
      status: v.status,
      edition: editionRole(v),
      muster: v.muster ?? "",
      wind: c.wind ?? "",
      swell: c.swell ?? "",
      heading: c.heading ?? "",
      speed: c.speed ?? "",
      series: v.series,
      seriesLabel: v.series ? (seriesLabelBySlug.get(v.series) ?? v.series) : null,
      seasonId: v.season_id,
      venueId: v.venue_id,
      /* Rendered back to the city's wall clock, ready for the input. */
      saleOpensAtLocal: wallClockValue(v.sale_opens_at, v.time_zone),
      presaleHours: v.presale_hours,
      depositCents: v.deposit_cents,
      byRequest: v.by_request,
      standbyPasses: v.standby_passes,
      ageLine: v.age_line ?? "",
    };
  });

  const cities = (must(citiesRes)).map((h) => ({ value: h.id, label: h.name }));
  /* Retired seasons and venues stay in the pickers, marked, so an episode
     that still holds one reads as what it is rather than as Unassigned. Active
     first; the composer offers only the active ones for a new filing. */
  const seasons: ProgramOption[] = (must(seasonsRes))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((s) => ({ value: s.id, label: s.active ? s.title : `${s.title} (retired)`, retired: !s.active }));
  const venues: ProgramOption[] = (must(venuesRes))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((v) => ({ value: v.id, label: v.active ? v.name : `${v.name} (retired)`, retired: !v.active }));
  const seriesList: SeriesOption[] = seriesRows.map((f) => ({
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
      <span className="hm-eyebrow">Episodes</span>
      <h1 className="hm-h1">The board.</h1>
      <EpisodesClient
        rows={rows}
        cities={cities}
        seasons={seasons}
        venues={venues}
        seriesList={seriesList}
        fleet={fleet
          .filter((v) => v.active)
          .map((v) => ({ id: v.id, name: v.name, capacity: v.capacity }))}
      />
    </div>
  );
}
