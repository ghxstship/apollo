"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

const TITLE_MAX = 120;
const BLURB_MAX = 300;
const ADDRESS_MAX = 300;

/* Seasons and venues take an address of 2–60 characters; a series takes 2–48.
   Each is a check constraint, and a constraint refusal reaches the operator
   as "check the numbers" — which names nothing — so the bounds live here too. */
const SLUG_MAX = 60;
const SERIES_SLUG_MAX = 48;
const SLUG_MIN = 2;

/* An id off a stale row is a malformed uuid by the time it reaches the driver,
   and the driver's refusal says "invalid input syntax for type uuid" to a
   person who never chose a type. Caught here and said in words. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  /* Step-free, lift, quiet room — what an access need wants to know before
     booking. Up to 200 characters; blank says nothing. */
  accessNote: string;
};

const ACCESS_NOTE_MAX = 200;

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

function slugify(v: string, max = SLUG_MAX): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/* The shape alone is not enough: "2026-02-30" is the right shape and the
   driver refuses it as out of range, which reaches the operator as "didn't
   land". Round-tripped through a real calendar so the 30th of February is
   caught here with a name. */
const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/* A season, venue or series that was retired or removed by another operator
   is still a row on this screen until the next reload. The update lands on
   nothing and Postgres calls that success; the operator is told instead. */
function noneTouched(res: { data: unknown[] | null; error: unknown }): boolean {
  return !res.error && !res.data?.length;
}

/* ── seasons ─────────────────────────────────────────────────────────────── */

export async function createSeason(input: NewSeason): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const title = input.title.trim();
  if (!title) return { error: "A season needs a name." };
  if (title.length > TITLE_MAX) return { error: `A season's name runs to ${TITLE_MAX} characters.` };

  const slug = slugify(input.slug || title);
  if (!slug) return { error: "That name leaves no address behind it." };
  if (slug.length < SLUG_MIN) return { error: `A season's address runs ${SLUG_MIN} to ${SLUG_MAX} characters — letters, numbers and hyphens.` };

  if (!isDay(input.startsOn) || !isDay(input.endsOn))
    return { error: "Both dates are needed, and each has to be a real day on the calendar." };
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
  if (!UUID.test(id)) return { error: "That season is not on the chart — reload the page." };
  const res = await supabase.from("seasons").update({ active }).eq("id", id).select("id");
  if (res.error) return { error: ERR_LAND };
  if (noneTouched(res)) return { error: "That season is not on the chart — reload the page." };
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
  if (slug.length < SLUG_MIN) return { error: `A venue's address runs ${SLUG_MIN} to ${SLUG_MAX} characters — letters, numbers and hyphens.` };

  if (!VENUE_KINDS.includes(input.kind))
    return { error: "Pick what kind of place it is." };

  /* The city comes off a picker, so anything that is not an id is a stale
     screen; a city that no longer exists is the same story one step later. */
  if (input.harborId && !UUID.test(input.harborId))
    return { error: "Pick the city off the list." };

  /* Refused rather than cut: the note is what an access need reads before
     booking, and a silently shortened one can drop the very line that mattered.
     Same bound and same words as setVenueAccessNote below. */
  const accessNote = (input.accessNote ?? "").trim();
  if (accessNote.length > ACCESS_NOTE_MAX)
    return { error: `An access note runs to ${ACCESS_NOTE_MAX} characters.` };

  const { error } = await supabase.from("venues").insert({
    slug,
    name,
    kind: input.kind,
    city_id: input.harborId || null,
    address: input.address.trim().slice(0, ADDRESS_MAX) || null,
    access_note: accessNote || null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: "That address is taken by another venue." };
    if (error.code === "23503") return { error: "That city is not on the chart — pick another." };
    return { error: ERR_LAND };
  }
  return done();
}

/* The access note on a standing venue — the one field that changes after a
   place is charted, when somebody has been and can say what the door is like. */
export async function setVenueAccessNote(id: string, accessNote: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "That venue is not on the chart — reload the page." };
  const note = accessNote.trim();
  if (note.length > ACCESS_NOTE_MAX) return { error: `An access note runs to ${ACCESS_NOTE_MAX} characters.` };
  const res = await supabase.from("venues").update({ access_note: note || null }).eq("id", id).select("id");
  if (res.error) return { error: ERR_LAND };
  if (noneTouched(res)) return { error: "That venue is not on the chart — reload the page." };
  return done();
}

export async function setVenueActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "That venue is not on the chart — reload the page." };
  const res = await supabase.from("venues").update({ active }).eq("id", id).select("id");
  if (res.error) return { error: ERR_LAND };
  if (noneTouched(res)) return { error: "That venue is not on the chart — reload the page." };
  return done();
}

/* ── series ──────────────────────────────────────────────────────────────── */

export async function createSeries(input: NewSeries): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const title = input.title.trim();
  if (!title) return { error: "A series needs a name." };
  if (title.length > TITLE_MAX) return { error: `A series' name runs to ${TITLE_MAX} characters.` };

  /* A series' address is shorter than a season's (48, not 60) because the
     episodes it raises take the address plus a date: "<series>-20260905". */
  const slug = slugify(input.slug || title, SERIES_SLUG_MAX);
  if (!slug) return { error: "That name leaves no address behind it." };
  if (slug.length < SLUG_MIN) return { error: `A series' address runs ${SLUG_MIN} to ${SERIES_SLUG_MAX} characters — letters, numbers and hyphens.` };

  /* The 1–92 window is a check constraint; the message here is the readable one. */
  const cadence = Math.round(input.cadenceDays);
  if (!Number.isFinite(cadence) || cadence < 1 || cadence > 92)
    return { error: "Cadence runs 1 to 92 days — pick a number inside that window." };

  if (!input.templateEpisodeId || !UUID.test(input.templateEpisodeId))
    return { error: "A series clones one episode forward — pick the template episode off the list." };

  const { error } = await supabase.from("editions").insert({
    slug,
    title,
    cadence_days: cadence,
    template_episode_id: input.templateEpisodeId,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: "That address is taken by another series." };
    if (error.code === "23503") return { error: "That template episode is not on the chart — pick another." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function setSeriesActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: "That series is not on the chart — reload the page." };
  const res = await supabase.from("editions").update({ active }).eq("id", id).select("id");
  if (res.error) return { error: ERR_LAND };
  if (noneTouched(res)) return { error: "That series is not on the chart — reload the page." };
  return done();
}

/* Clone the template forward at the cadence. The RPC is staff-gated and
   idempotent by slug — dates that already hold an episode are skipped — so the
   number it returns is the truth about what this call actually raised. Its
   refusals are written in the club's voice; hand them over verbatim. */
export async function extendSeries(seriesId: string, count: number): Promise<ExtendResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  if (!UUID.test(seriesId)) return { error: "That series is not on the chart — reload the page." };
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
