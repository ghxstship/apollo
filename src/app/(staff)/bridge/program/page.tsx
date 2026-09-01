import type { Metadata } from "next";
import { logDate } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import {
  ProgramClient,
  type SeasonPanelRow,
  type SeriesPanelRow,
  type VenuePanelRow,
} from "./program-client";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramPage() {
  const { supabase } = await getOperator();

  const [seasonsRes, venuesRes, seriesRes, harborsRes, voyagesRes, upcomingRes] =
    await Promise.all([
      supabase.from("seasons").select("*").order("starts_on", { ascending: false }),
      supabase.from("venues").select("*").order("name", { ascending: true }),
      supabase.from("voyage_series").select("*").order("created_at", { ascending: false }),
      supabase.from("harbors").select("id, name").order("position", { ascending: true }),
      /* One read, three lookups: the per-season and per-series tallies, and the
         template titles for series rows — a template may already have sailed,
         so the upcoming picker below cannot answer for it. */
      supabase.from("voyages").select("id, title, season_id, series_id"),
      /* The template picker. A template seeds occurrences from its own start
         date forward, so only sailings still on the board are offered. */
      supabase
        .from("voyages")
        .select("id, title, starts_at, time_zone")
        .in("status", ["scheduled", "live"])
        .order("starts_at", { ascending: true }),
    ]);

  const seasonCounts = new Map<string, number>();
  const seriesCounts = new Map<string, number>();
  const voyageTitles = new Map<string, string>();
  for (const v of must(voyagesRes)) {
    voyageTitles.set(v.id, v.title);
    if (v.season_id) seasonCounts.set(v.season_id, (seasonCounts.get(v.season_id) ?? 0) + 1);
    if (v.series_id) seriesCounts.set(v.series_id, (seriesCounts.get(v.series_id) ?? 0) + 1);
  }

  const seasons: SeasonPanelRow[] = must(seasonsRes).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    active: s.active,
    voyages: seasonCounts.get(s.id) ?? 0,
  }));

  const harborNames = new Map(must(harborsRes).map((h) => [h.id, h.name]));
  const venues: VenuePanelRow[] = must(venuesRes).map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    kind: v.kind,
    harbor: v.harbor_id ? (harborNames.get(v.harbor_id) ?? null) : null,
    active: v.active,
  }));

  const series: SeriesPanelRow[] = must(seriesRes).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    cadenceDays: s.cadence_days,
    template: voyageTitles.get(s.template_voyage_id) ?? "—",
    occurrences: seriesCounts.get(s.id) ?? 0,
    active: s.active,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Program</span>
      <h1 className="hm-h1">The standing furniture.</h1>
      <p className="hm-lede">
        Seasons frame the calendar, venues are the places the club returns to, and a
        series clones one sailing forward on a cadence. Nothing here is deleted —
        retired entries stand aside, and their sailings keep the record.
      </p>
      <p className="hm-note">
        The flow: raise one sailing by hand on Voyages, make it the template here,
        extend the series — each occurrence inherits everything, format, deposit,
        and presale window included.
      </p>
      <ProgramClient
        seasons={seasons}
        venues={venues}
        series={series}
        harbors={must(harborsRes).map((h) => ({ value: h.id, label: h.name }))}
        templates={must(upcomingRes).map((v) => ({
          value: v.id,
          label: `${v.title} · ${logDate(v.starts_at, v.time_zone)}`,
        }))}
      />
    </div>
  );
}
