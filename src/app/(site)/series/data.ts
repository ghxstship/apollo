import "server-only";
import { moduleTables } from "@/lib/module-tables";
import type { createClient } from "@/lib/supabase/server";

/* The series catalogue, read from the shore.

   `series` belongs to another module, so it is reached through the moduleTables
   seam and typed at the boundary here — the same arrangement /episodes already
   uses to read a series' label and access. The row is anon-readable while it is
   active ("formats are anon-readable" ... `to anon using (active)`), which is
   what lets these pages be published without a session. Everything below asks
   for `active` explicitly rather than trusting the policy to do the filtering:
   a signed-in member reads the same rows through a policy that also admits
   staff, and a page that renders differently for a member than for a visitor is
   not the page anyone reviewed. */

type Client = Awaited<ReturnType<typeof createClient>>;

export interface SeriesRow {
  slug: string;
  label: string;
  blurb: string;
  /** Where the strand happens. The series axis names its ashore value `port`,
      not `shore`; null means the strand runs both, which four of the five do. */
  category: string | null;
  experience_class: string | null;
  /** open | seasonal | included | on_request | invite — the door, and on this
      surface the difference between a strand of the season and a product. */
  access: string;
  /** Whether a guest has to be vetted to come. Said here, on a public page,
      because it is the club's own standard and someone deciding whether to
      apply should meet it before the form, not after. */
  requires_vetting: boolean;
}

/* requires_vetting joined the read when the member-side catalogue was retired:
   it was the one fact that page carried which this one did not, and it is a
   fact a prospective member should meet BEFORE applying rather than after.
   Price and capacity did not come with it — under Model C both live on the
   episode, and the series row holds null for each. */
const SERIES_COLUMNS = "slug, label, blurb, category, experience_class, access, requires_vetting";

/* A door that does not open to the shore is not a row on a public catalogue.

   The rule is the data model's own, written into the migration that seeded the
   five strands: seasonal "still lists publicly, where invite and on_request do
   not". The public episode listing already applies exactly this test before it
   will offer a pass, and applying it here keeps one answer to one question
   across two surfaces.

   Today it removes precisely one row. Private charter is active, and correctly
   so — it is a real product with its own door, reached by enquiry from an
   episode rather than from a season catalogue — but it carries no run, so on a
   page whose whole subject is the strands that carry Season I it read as a
   sixth strand with nothing in it. */
export function listsToTheShore(series: SeriesRow): boolean {
  return series.access !== "invite" && series.access !== "on_request";
}

export interface SeriesEpisode {
  slug: string;
  title: string;
  blurb: string | null;
  series: string | null;
  setting: string;
  starts_at: string;
  ends_at: string | null;
  time_zone: string;
}

/* Season I, Miami. Every episode of it carries an `s1-wNN-` slug and nothing
   else in the table does, so this one pattern is the season.

   Both surfaces read it. The index prints a count per strand and the strand's
   own page prints the list behind that count; if they filtered differently the
   index would promise twelve episodes and the page would show thirteen, which
   is the kind of disagreement a reader reads as the site being wrong about
   itself rather than about one number. */
const SEASON_ONE_SLUGS = "s1-w%";

/* Ordered by the catalogue's own `position` — the owner's order, which runs
   Anchor first and is not alphabetical. */
export async function readSeries(supabase: Client): Promise<SeriesRow[]> {
  const { data } = await moduleTables(supabase)
    .from("series")
    .select(SERIES_COLUMNS)
    .eq("active", true)
    .order("position", { ascending: true });
  return (data ?? []) as SeriesRow[];
}

/* One strand, or null. Null covers both halves of the same answer — a slug no
   series has ever held, and a series the club has stood down — because a
   retired strand is not a page, and the caller has nothing different to say
   about the two.

   Active is the whole test here, deliberately wider than the index's. The
   index answers "what carries Season I" and owes the reader five; this answers
   "is there such a series", and a live product that happens not to list on a
   season catalogue still has a true page to show. Nothing links to it, and the
   route audit walks every active slug — so the wider test is the difference
   between the audit reading a real page and reading a 404 the club meant. */
export async function readOneSeries(
  supabase: Client,
  slug: string
): Promise<SeriesRow | null> {
  const { data } = await moduleTables(supabase)
    .from("series")
    .select(SERIES_COLUMNS)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return (data ?? null) as SeriesRow | null;
}

/* The season's episodes, oldest first. `series` is passed when one strand is
   being read and omitted when the index is counting all five. */
export async function readSeasonOneEpisodes(
  supabase: Client,
  series?: string
): Promise<SeriesEpisode[]> {
  const query = supabase
    .from("episodes")
    .select("slug, title, blurb, series, setting, starts_at, ends_at, time_zone")
    .like("slug", SEASON_ONE_SLUGS)
    .order("starts_at", { ascending: true });
  const { data } = await (series ? query.eq("series", series) : query);
  return (data ?? []) as SeriesEpisode[];
}

/* Where a strand happens, as a reader meets it.

   Not SETTING_LABEL: that map is keyed on `episodes.setting`, whose values are
   sea/shore/sky, and the series axis says `port` where an episode says `shore`.
   Feeding one map the other's vocabulary returns undefined, so the two are
   named apart here rather than looked up across.

   Null is the honest answer for four of the five strands and is stated rather
   than guessed — Off Soundings is an airboat one month and a polo field the
   next, and picking one would be wrong half the year. */
export function seriesSetting(category: string | null): string {
  if (category === "sea") return "Afloat";
  if (category === "port") return "Ashore";
  return "Afloat and ashore";
}
