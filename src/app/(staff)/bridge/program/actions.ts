"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

const TITLE_MAX = 120;
const BLURB_MAX = 300;
const ADDRESS_MAX = 300;

export type VenueKind = "marina" | "club" | "restaurant" | "beach" | "pool" | "partner";

const VENUE_KINDS: VenueKind[] = ["marina", "club", "restaurant", "beach", "pool", "partner"];

export type NewSeason = {
  title: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  blurb: string;
};

export type NewVenue = {
  name: string;
  slug: string;
  kind: VenueKind;
  harborId: string | null;
  address: string;
};

export type NewSeries = {
  title: string;
  slug: string;
  cadenceDays: number;
  templateEpisodeId: string | null;
};

/* Extending a series raises real episodes, so the result carries the tally the
   RPC reports back — the screen reads it out rather than guessing. */
export type ExtendResult = ActionResult & { raised?: number };

function done(): ActionResult {
  revalidatePath("/bridge/program");
  /* The Episodes composer offers seasons, venues, and series in its pickers. */
  revalidatePath("/bridge/episodes");
  return {};
}

/* An extension puts new episodes on the board, and the board is everywhere. */
function doneWithSailings(): void {
  revalidatePath("/bridge/program");
  revalidatePath("/bridge/episodes");
  revalidatePath("/bridge/manifests");
  revalidatePath("/passes");
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/episodes");
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/* ── seasons ─────────────────────────────────────────────────────────────── */

export async function createSeason(input: NewSeason): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const title = input.title.trim();
  if (!title) return { error: "A season needs a name." };
  if (title.length > TITLE_MAX) return { error: `A season's name runs to ${TITLE_MAX} characters.` };

  const slug = slugify(input.slug || title);
  if (!slug) return { error: "That name leaves no address behind it." };

  if (!isDay(input.startsOn) || !isDay(input.endsOn))
    return { error: "Both dates are needed." };
  if (input.endsOn <= input.startsOn) return { error: "It has to end after it starts." };

  const { error } = await supabase.from("seasons").insert({
    slug,
    title,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    blurb: input.blurb.trim().slice(0, BLURB_MAX) || null,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "That address is taken by another season."
        : ERR_LAND,
    };
  }
  return done();
}

/* Retire, never delete — episodes point at a season and keep pointing at it. */
export async function setSeasonActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("seasons").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

/* ── venues ──────────────────────────────────────────────────────────────── */

export async function createVenue(input: NewVenue): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = input.name.trim();
  if (!name) return { error: "A venue needs a name." };
  if (name.length > TITLE_MAX) return { error: `A venue's name runs to ${TITLE_MAX} characters.` };

  const slug = slugify(input.slug || name);
  if (!slug) return { error: "That name leaves no address behind it." };

  if (!VENUE_KINDS.includes(input.kind))
    return { error: "Pick what kind of place it is." };

  const { error } = await supabase.from("venues").insert({
    slug,
    name,
    kind: input.kind,
    city_id: input.harborId || null,
    address: input.address.trim().slice(0, ADDRESS_MAX) || null,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "That address is taken by another venue."
        : ERR_LAND,
    };
  }
  return done();
}

export async function setVenueActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("venues").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

/* ── series ──────────────────────────────────────────────────────────────── */

export async function createSeries(input: NewSeries): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const title = input.title.trim();
  if (!title) return { error: "A series needs a name." };
  if (title.length > TITLE_MAX) return { error: `A series' name runs to ${TITLE_MAX} characters.` };

  const slug = slugify(input.slug || title);
  if (!slug) return { error: "That name leaves no address behind it." };

  /* The 1–92 window is a check constraint; the message here is the readable one. */
  const cadence = Math.round(input.cadenceDays);
  if (!Number.isFinite(cadence) || cadence < 1 || cadence > 92)
    return { error: "Cadence runs 1 to 92 days — pick a number inside that window." };

  if (!input.templateEpisodeId)
    return { error: "A series clones one episode forward — pick the template episode." };

  const { error } = await supabase.from("editions").insert({
    slug,
    title,
    cadence_days: cadence,
    template_episode_id: input.templateEpisodeId,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "That address is taken by another series."
        : ERR_LAND,
    };
  }
  return done();
}

export async function setSeriesActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("editions").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Clone the template forward at the cadence. The RPC is staff-gated and
   idempotent by slug — dates that already hold an episode are skipped — so the
   number it returns is the truth about what this call actually raised. Its
   refusals are written in the club's voice; hand them over verbatim. */
export async function extendSeries(seriesId: string, count: number): Promise<ExtendResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const n = Math.round(count);
  if (!Number.isFinite(n) || n < 1 || n > 26)
    return { error: "An extension raises 1 to 26 episodes at a time." };

  const { data, error } = await supabase.rpc("extend_the_series", {
    p_series: seriesId,
    p_count: n,
  });
  /* The RPC raises in the club's voice (P0001) and voice() passes that
     through; anything else — a malformed id, a constraint — used to reach the
     operator as Postgres's own words. */
  if (error) return { error: voice(error) };

  doneWithSailings();
  return { raised: data ?? 0 };
}
