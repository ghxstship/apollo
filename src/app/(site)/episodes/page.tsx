import type { Metadata } from "next";
import { CITY_CODES } from "@/lib/brand";
import { SETTING_LABEL, logDate, logTime, price } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import {
  depositChip,
  durationChip,
  fleetChip,
  onSaleChip,
  weekChip,
} from "@/components/site/voyage-chips";
import { fleetByVoyage } from "@/components/site/voyage-data";
import { VoyageManifest, type ManifestItem } from "./manifest";

export const metadata: Metadata = {
  alternates: { canonical: "/episodes" },
  title: "Episodes",
  description:
    "Every episode of the season, afloat and ashore. Passes are few by design.",
};

export default async function VoyagesPage() {
  const supabase = await createClient();
  const now = new Date();
  const nowMs = now.getTime();
  const [
    { data: voyages },
    { data: capacity },
    { data: harbors },
    { data: formatRows },
    { data: seriesRows },
  ] = await Promise.all([
    supabase
      .from("voyages")
      /* Joined titles ride along for the Season filter and the series chip —
         both tables are public reading by policy. The series embed is hinted
         through series_id: voyage_series holds a second path back to voyages
         (template_voyage_id), and PostgREST refuses to guess between them. */
      .select("*, seasons(title), voyage_series!series_id(title)")
      .in("status", ["scheduled", "live", "weather_hold"])
      /* An episode that has cast off is not on offer, whatever its status
         still says — the detail page and this listing already knew this. */
      .gte("starts_at", now.toISOString())
      .order("starts_at", { ascending: true }),
    supabase.from("voyage_capacity").select("*"),
    supabase.from("harbors").select("*").order("position", { ascending: true }),
    /* A format's access decides whether an episode is on offer at all. Invite
       and on-request formats are refused at the booking guard, so listing them
       as passes would be advertising a door that does not open. Its label is
       what a row actually reads — the format names itself, once, read here and
       mapped by slug rather than fetched per row. Another module's table,
       reached through the moduleTables seam. */
    moduleTables(supabase).from("activity_formats").select("slug, label, access"),
    /* Series templates are the pattern a series is cut from, not episodes —
       they carry a date because the cloner needs one to shift from. */
    supabase.from("voyage_series").select("template_voyage_id"),
  ]);

  const formatBySlug = new Map(
    ((formatRows ?? []) as Array<{ slug: string; label: string; access: string }>).map(
      (f) => [f.slug, f] as const
    )
  );
  const accessOf = (slug: string | null) => (slug ? formatBySlug.get(slug)?.access ?? null : null);
  const templateIds = new Set((seriesRows ?? []).map((s) => s.template_voyage_id));
  const listed = (voyages ?? []).filter((v) => {
    if (templateIds.has(v.id)) return false;
    const access = accessOf(v.format);
    return access !== "invite" && access !== "on_request";
  });

  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.voyage_id, c] as const)
  );
  const harborById = new Map((harbors ?? []).map((h) => [h.id, h] as const));
  const fleets = await fleetByVoyage(listed.map((v) => v.id));

  const items: ManifestItem[] = listed.map((v) => {
    const cap = capacityById.get(v.id);
    const harbor = v.harbor_id ? harborById.get(v.harbor_id) : null;
    const starts = new Date(v.starts_at);
    /* Announced, not yet on offer: the hour stands where the pass count would. */
    const notYetOnSale = !!v.sale_opens_at && Date.parse(v.sale_opens_at) > nowMs;
    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      cls: v.class,
      /* The badge names the series and how long it runs. Where an episode has
         no series it names the setting instead — see the note on the homepage
         card: a null series means unfiled, not deliberately standalone, and
         falling back to Special printed SPECIAL on every card in the list. */
      formatLabel:
        (v.format && formatBySlug.get(v.format)?.label) || SETTING_LABEL[v.class] || "Afloat",
      /* Omitted rather than guessed when the episode has no end. */
      hours: durationChip(v.starts_at, v.ends_at) ?? "",
      status: v.status,
      date: logDate(v.starts_at, v.time_zone),
      time: logTime(v.starts_at, v.time_zone),
      coordinates: v.coordinates,
      distance: v.distance_nm != null ? `${v.distance_nm} NM` : null,
      price: price(v.price_cents),
      passesLeft: cap?.berths_left ?? null,
      seatsWord: "passes",
      onSale: notYetOnSale && v.sale_opens_at ? onSaleChip(v.sale_opens_at, v.time_zone) : null,
      blurb: v.blurb,
      week: weekChip(v.starts_at),
      fleet: v.class === "sea" ? fleetChip(fleets.get(v.id) ?? []) : null,
      deposit: v.deposit_required ? depositChip(v.deposit_cents) : null,
      harborId: v.harbor_id,
      harborLabel: harbor ? CITY_CODES[harbor.slug] ?? harbor.name : null,
      seasonId: v.season_id,
      /* The hand-maintained Database type carries no Relationships, so the
         embedded titles arrive untyped — the cast is the same one the clause
         reader uses, and the shape is one column deep. */
      seasonLabel: (v.seasons as unknown as { title: string } | null)?.title ?? null,
      series: (v.voyage_series as unknown as { title: string } | null)?.title ?? null,
      monthKey: `${starts.getFullYear()}-${String(starts.getMonth() + 1).padStart(2, "0")}`,
      startsMs: starts.getTime(),
    };
  });

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">Season I</span>
        <h1>Episodes.</h1>
        <p className="ws-phead__sub">
          Every episode of the season, afloat and ashore. Passes are few by
          design — reserve early, arrive rested.
        </p>
      </div>
      <VoyageManifest items={items} />
    </div>
  );
}
