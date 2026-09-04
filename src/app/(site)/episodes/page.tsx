import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
} from "@/components/site/episode-chips";
import { fleetByEpisode } from "@/components/site/episode-data";
import { EpisodeManifest, type ManifestItem } from "./manifest";

export const metadata: Metadata = {
  alternates: { canonical: "/episodes" },
  title: "Episodes",
  description:
    "Every episode of the season, afloat and ashore. Passes are few by design.",
};

export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const nowMs = now.getTime();
  const [
    { data: episodes },
    { data: capacity },
    { data: cities },
    { data: seriesRows },
    { data: editionRows },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("episodes")
      /* Joined titles ride along for the Season filter and the edition chip —
         both tables are public reading by policy. The edition embed is hinted
         through edition_id: editions holds a second path back to episodes
         (template_episode_id), and PostgREST refuses to guess between them. */
      .select("*, seasons(title), editions!edition_id(title)")
      .in("status", ["scheduled", "live", "weather_hold"])
      /* An episode that has cast off is not on offer, whatever its status
         still says — the detail page and this listing already knew this. */
      .gte("starts_at", now.toISOString())
      .order("starts_at", { ascending: true }),
    supabase.from("episode_capacity").select("*"),
    supabase.from("cities").select("*").order("position", { ascending: true }),
    /* A series' access decides whether an episode is on offer at all. Invite
       and on-request series are refused at the booking guard, so listing them
       as passes would be advertising a door that does not open. Its label is
       what a row actually reads — the series names itself, once, read here and
       mapped by slug rather than fetched per row. Another module's table,
       reached through the moduleTables seam. */
    moduleTables(supabase).from("series").select("slug, label, access"),
    /* Edition templates are the pattern an edition is cut from, not episodes
       on offer — they carry a date because the cloner needs one to shift from. */
    supabase.from("editions").select("template_episode_id"),
    /* Rides along with the calendar rather than after it — a standing view is
       one more thing to know before rendering, not a second round trip. */
    supabase.auth.getUser(),
  ]);

  const seriesBySlug = new Map(
    ((seriesRows ?? []) as Array<{ slug: string; label: string; access: string }>).map(
      (f) => [f.slug, f] as const
    )
  );
  const accessOf = (slug: string | null) => (slug ? seriesBySlug.get(slug)?.access ?? null : null);
  const templateIds = new Set((editionRows ?? []).map((e) => e.template_episode_id));
  const listed = (episodes ?? []).filter((v) => {
    if (templateIds.has(v.id)) return false;
    const access = accessOf(v.series);
    return access !== "invite" && access !== "on_request";
  });

  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.episode_id, c] as const)
  );
  const cityById = new Map((cities ?? []).map((h) => [h.id, h] as const));
  /* A member's standing view of the manifest — see standing.ts.

     Applied by REDIRECT rather than by rendering a filtered list under a bare
     URL, and that is the whole point: every other list in this app now holds
     its state in the address bar, and a page that quietly showed something
     other than what its URL described would be the one exception. The reader
     lands on the link they would have sent.

     Only a bare visit redirects. Once the query string says anything at all —
     including after the reader clears the filters — the URL is what they asked
     for and it is left alone.

     Read and acted on BEFORE the fleet query below: a redirect throws away
     everything the render would have used, so the one await that is still
     ahead of it should not be paid for by a reader who is about to be sent
     somewhere else. */
  const standing = user
    ? ((
        await supabase
          .from("profiles")
          .select("manifest_filters")
          .eq("id", user.id)
          .maybeSingle()
      ).data?.manifest_filters ?? null)
    : null;
  if (standing && Object.keys(sp).length === 0) redirect(`/episodes?${standing}`);

  const fleets = await fleetByEpisode(listed.map((v) => v.id));

  const items: ManifestItem[] = listed.map((v) => {
    const cap = capacityById.get(v.id);
    const city = v.city_id ? cityById.get(v.city_id) : null;
    const starts = new Date(v.starts_at);
    /* Announced, not yet on offer: the hour stands where the pass count would. */
    const notYetOnSale = !!v.sale_opens_at && Date.parse(v.sale_opens_at) > nowMs;
    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      cls: v.setting,
      /* The badge names the series and how long it runs. Where an episode has
         no series it names the setting instead — see the note on the homepage
         card: a null series means unfiled, not deliberately standalone, and
         falling back to Special printed SPECIAL on every card in the list. */
      seriesLabel:
        (v.series && seriesBySlug.get(v.series)?.label) || SETTING_LABEL[v.setting] || "Afloat",
      /* The slug, separately, because seriesLabel falls back to the setting and
         so cannot be filtered on — two episodes reading AFLOAT may belong to no
         series at all, or to two different ones. */
      seriesSlug: v.series,
      /* Omitted rather than guessed when the episode has no end. */
      hours: durationChip(v.starts_at, v.ends_at) ?? "",
      status: v.status,
      date: logDate(v.starts_at, v.time_zone),
      time: logTime(v.starts_at, v.time_zone),
      distance: v.distance_nm != null ? `${v.distance_nm} NM` : null,
      price: price(v.price_cents),
      priceCents: v.price_cents,
      passesLeft: cap?.passes_left ?? null,
      seatsWord: "passes",
      onSale: notYetOnSale && v.sale_opens_at ? onSaleChip(v.sale_opens_at, v.time_zone) : null,
      blurb: v.blurb,
      week: weekChip(v.starts_at),
      fleet: v.setting === "sea" ? fleetChip(fleets.get(v.id) ?? []) : null,
      deposit: v.deposit_required ? depositChip(v.deposit_cents) : null,
      harborId: v.city_id,
      cityLabel: city ? CITY_CODES[city.slug] ?? city.name : null,
      seasonId: v.season_id,
      /* The hand-maintained Database type carries no Relationships, so the
         embedded titles arrive untyped — the cast is the same one the clause
         reader uses, and the shape is one column deep. */
      seasonLabel: (v.seasons as unknown as { title: string } | null)?.title ?? null,
      series: (v.editions as unknown as { title: string } | null)?.title ?? null,
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
      <EpisodeManifest items={items} standing={standing} signedIn={!!user} />
    </div>
  );
}
