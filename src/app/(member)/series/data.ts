import "server-only";
import { moduleTables } from "@/lib/module-tables";
import type { ExperienceClassId } from "@/lib/brand";

/* Activity — the taxonomy, read.

   Two axes, because there were always two facts. `category` says WHERE a series
   happens — sea or port, rendered as afloat or ashore — and `experience_class`
   says what kind of thing it is. What is modelled here is the one thing the kit
   actually asserts about behaviour — an ashore series never requires vetting —
   plus the three facts every tile is required to state: capacity, price, and
   what it does not include.

   `episodes.setting`, `.kind` and `.sub_class` are untouched. They answer
   different questions (which water, which family, how long) and a series is a
   further axis, not a replacement for any of them: a private charter is afloat
   AND premium, so premium cannot be a value of `setting` without losing the
   ability to say so. */

/* `bookable` was called `open` until the two-axis migration, where open became
   an experience class. A series publishes a price exactly when it is bookable —
   the same constraint, in the word that no longer collides. */
export type SeriesAccess = "bookable" | "invite" | "on_request" | "included" | "seasonal";

/** Where a series happens. `premium` left this axis with the two-axis split. */
export type SettingId = "sea" | "port";

export interface SeriesRecord {
  slug: string;
  /* Nullable since the Miami programme landed: a series runs both settings.
     Off Soundings is an airboat one month and a polo field the next, so the
     column stopped being able to hold one answer. Null means either. */
  category: SettingId | null;
  experience_class: ExperienceClassId;
  label: string;
  blurb: string;
  division: string;
  access: SeriesAccess;
  price_cents: number | null;
  capacity: number | null;
  requires_vetting: boolean;
  excludes: string[];
  position: number;
}

export interface FiledEpisode {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  time_zone: string;
  status: string;
  series: string | null;
}

/* "On request" and "Invite" are complete answers, never placeholders. So an
   unpriced series renders a sentence, not a dash and not a zero — a dash reads
   as an omission somebody will fill in later, which is exactly the impression
   the kit forbids. */
export const ACCESS_ANSWER: Record<SeriesAccess, string> = {
  bookable: "",
  invite: "By invitation",
  on_request: "On request",
  included: "Included with a pass",
  seasonal: "Announced by season",
};

export function formatPrice(f: Pick<SeriesRecord, "access" | "price_cents">): string {
  if (f.access === "bookable" && f.price_cents != null) {
    return `$${(f.price_cents / 100).toLocaleString("en-US")}`;
  }
  return ACCESS_ANSWER[f.access];
}

/* Class accents ride the division that hosts the class, and they land on a
   keyline only. README §4 reserves division hues for identity and puts
   operational state on the greyscale; the kit's own "never two accents on one
   artboard" is honoured by giving each class its own block and never letting an
   accent reach type or ground.

   Exotic takes Limited's deep step rather than borrowing a fourth division's
   identity: exotic is Limited going further, not a different maker. */
export const EXPERIENCE_ACCENT: Record<ExperienceClassId, string> = {
  open: "var(--brand-bound)",
  club: "var(--brand-hinged)",
  premium: "var(--brand-limited)",
  exotic: "var(--brand-limited-deep)",
};

export async function readSeries(supabase: unknown): Promise<SeriesRecord[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("series")
    .select(
      "slug,category,experience_class,label,blurb,division,access,price_cents,capacity,requires_vetting,excludes,position",
    )
    .eq("active", true)
    .order("position");
  return (data ?? []) as SeriesRecord[];
}

/* Which episodes are filed under a series. All eighteen episodes that exist are
   unfiled, and that is the honest state of the pivot rather than a bug: filing
   them would mean guessing, and the booking guard reads an unfiled episode as
   requiring a pass, which is the safe way to be wrong. */
export async function readFiledSailings(supabase: unknown): Promise<FiledEpisode[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("episodes")
    .select("id,slug,title,starts_at,time_zone,status,series")
    .not("series", "is", null)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at");
  return (data ?? []) as FiledEpisode[];
}
