import "server-only";
import { moduleTables } from "@/lib/module-tables";
import type { ExperienceClassId } from "@/lib/brand";

/* Activity — the taxonomy, read.

   Two axes, because there were always two facts. `category` says WHERE a format
   happens — sea or port, rendered as afloat or ashore — and `experience_class`
   says what kind of thing it is. What is modelled here is the one thing the kit
   actually asserts about behaviour — an ashore format never requires vetting —
   plus the three facts every tile is required to state: capacity, price, and
   what it does not include.

   `voyages.class`, `.kind` and `.sub_class` are untouched. They answer
   different questions (which water, which family, how long) and a format is a
   further axis, not a replacement for any of them: a private charter is afloat
   AND premium, so premium cannot be a value of `class` without losing the
   ability to say so. */

/* `bookable` was called `open` until the two-axis migration, where open became
   an experience class. A format publishes a price exactly when it is bookable —
   the same constraint, in the word that no longer collides. */
export type FormatAccess = "bookable" | "invite" | "on_request" | "included" | "seasonal";

/** Where a format happens. `premium` left this axis with the two-axis split. */
export type FormatSetting = "sea" | "port";

export interface ActivityFormat {
  slug: string;
  category: FormatSetting;
  experience_class: ExperienceClassId;
  label: string;
  blurb: string;
  division: string;
  access: FormatAccess;
  price_cents: number | null;
  capacity: number | null;
  requires_vetting: boolean;
  excludes: string[];
  position: number;
}

export interface FiledSailing {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  time_zone: string;
  status: string;
  format: string | null;
}

/* "On request" and "Invite" are complete answers, never placeholders. So an
   unpriced format renders a sentence, not a dash and not a zero — a dash reads
   as an omission somebody will fill in later, which is exactly the impression
   the kit forbids. */
export const ACCESS_ANSWER: Record<FormatAccess, string> = {
  bookable: "",
  invite: "By invitation",
  on_request: "On request",
  included: "Included with a pass",
  seasonal: "Announced by season",
};

export function formatPrice(f: Pick<ActivityFormat, "access" | "price_cents">): string {
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

export async function readFormats(supabase: unknown): Promise<ActivityFormat[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("activity_formats")
    .select(
      "slug,category,experience_class,label,blurb,division,access,price_cents,capacity,requires_vetting,excludes,position",
    )
    .eq("active", true)
    .order("position");
  return (data ?? []) as ActivityFormat[];
}

/* Which sailings are filed under a format. All eighteen voyages that exist are
   unfiled, and that is the honest state of the pivot rather than a bug: filing
   them would mean guessing, and the booking guard reads an unfiled sailing as
   requiring a pass, which is the safe way to be wrong. */
export async function readFiledSailings(supabase: unknown): Promise<FiledSailing[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("voyages")
    .select("id,slug,title,starts_at,time_zone,status,format")
    .not("format", "is", null)
    .in("status", ["scheduled", "live", "weather_hold"])
    .order("starts_at");
  return (data ?? []) as FiledSailing[];
}
