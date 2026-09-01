import "server-only";
import { moduleTables } from "@/lib/module-tables";
import type { ActivityCategory } from "@/lib/brand";

/* Activity — the taxonomy, read.

   The activity kit is a poster, not a schema: three categories, four tiles
   each, and no field list, no key and no cardinality anywhere in it. What is
   modelled here is the one thing the kit actually asserts about behaviour —
   Port formats never require a Captain's Pass — plus the three facts every tile
   is required to state: capacity, price, and what it does not include.

   `voyages.class`, `.kind` and `.sub_class` are untouched. They answer
   different questions (which water, which family, how long) and a format is a
   fourth axis, not a replacement for any of them: a private charter is Sea AND
   Premium, so Premium cannot be a value of `class` without losing the ability
   to say so. */

export type FormatAccess = "open" | "invite" | "on_request" | "included" | "seasonal";

export interface ActivityFormat {
  slug: string;
  category: ActivityCategory;
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
  open: "",
  invite: "By invitation",
  on_request: "On request",
  included: "Included with a pass",
  seasonal: "Announced by season",
};

export function formatPrice(f: Pick<ActivityFormat, "access" | "price_cents">): string {
  if (f.access === "open" && f.price_cents != null) {
    return `$${(f.price_cents / 100).toLocaleString("en-US")}`;
  }
  return ACCESS_ANSWER[f.access];
}

export const CATEGORY_LINE: Record<ActivityCategory, string> = {
  sea: "Sailings, sandbar socials, water sports, crossings.",
  port: "Pool, beach, nightlife, mixers, Shore Leave.",
  premium: "Private charters, daybeds, member gatherings.",
};

/* Category accents ride the division that hosts the category, and they land on
   a keyline only. README §4 reserves division hues for identity and puts
   operational state on the greyscale; the kit's own "never two accents on one
   artboard" is honoured by giving each category its own block and never letting
   an accent reach type or ground. */
export const CATEGORY_ACCENT: Record<ActivityCategory, string> = {
  sea: "var(--brand-hinged)",
  port: "var(--brand-bound)",
  premium: "var(--brand-limited)",
};

export async function readFormats(supabase: unknown): Promise<ActivityFormat[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("activity_formats")
    .select("slug,category,label,blurb,division,access,price_cents,capacity,requires_vetting,excludes,position")
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
