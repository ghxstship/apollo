"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

/* Shape-checked properly: the old /^[0-9a-f-]{36}$/ let 36 hyphens through
   to the driver, whose refusal reached the operator as "didn't land". */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CITY_STATUS = new Set(["open", "waitlist", "soon", "closed"]);
/* A row on this screen can be struck by another operator between the page
   load and the save. "Try again" would be the wrong advice; reloading is. */
const NO_CITY = "That city is no longer on the chart — reload the page.";
const NO_HULL = "That hull is no longer in the fleet — reload the page.";
/* The day rate is an integer of cents; a stray keystroke past a million
   dollars a day is a typo before it is an overflow, and the overflow says
   nothing an operator can act on. */
const DAY_RATE_MAX_DOLLARS = 1_000_000;

function done(): ActionResult {
  revalidatePath("/bridge/fleet");
  revalidatePath("/");
  revalidatePath("/episodes");
  return {};
}

/* A city is the market. Until 2026-09-04 opening one was a migration against
   production; this is the same write with a person's name on the audit row.
   The time zone matters more than it looks: every departure on the manifest
   reads on the city's clock. */
export async function saveCity(
  id: string | null,
  patch: {
    name: string;
    slug: string;
    status: string;
    time_zone: string;
    coordinates: string;
    launch_year: string;
    position: string;
  }
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (id !== null && !UUID.test(id)) return { error: NO_CITY };

  const name = patch.name.trim().slice(0, 80);
  const slug = patch.slug.trim().toLowerCase();
  if (!name) return { error: "A city needs a name." };
  if (!SLUG.test(slug) || slug.length > 40) return { error: "The slug is lowercase words joined by hyphens — los-angeles." };
  if (!CITY_STATUS.has(patch.status)) return { error: "Status is open, waitlist, soon or closed." };
  const tz = patch.time_zone.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { error: "The time zone is an IANA name — America/Los_Angeles." };
  }
  const year = patch.launch_year.trim() === "" ? null : Number(patch.launch_year);
  if (year !== null && (!Number.isInteger(year) || year < 2020 || year > 2100)) {
    return { error: "The launch year is a four-digit year." };
  }
  const position = Number(patch.position);
  if (!Number.isInteger(position) || position < 1 || position > 99) return { error: "Position is 1 to 99." };

  const row = {
    name,
    slug,
    status: patch.status,
    time_zone: tz,
    coordinates: patch.coordinates.trim().slice(0, 60) || null,
    launch_year: year,
    position,
  };
  const { data, error } = id
    ? await supabase.from("cities").update(row).eq("id", id).select("id")
    : await supabase.from("cities").insert(row).select("id");
  if (error) {
    return { error: error.code === "23505" ? "A city already carries that slug." : ERR_LAND };
  }
  if (id && !data?.length) return { error: NO_CITY };
  return done();
}

/* A hull. Capacity is what the ratio caps and the fill figures read, so it is
   bounded here rather than trusted; the day rate feeds the P&L and is null
   until the charter contract says otherwise. */
export async function saveVessel(
  id: string | null,
  patch: {
    name: string;
    capacity: string;
    home_city: string;
    day_rate: string;
    length_ft: string;
    year: string;
    cabins: string;
    active: boolean;
  }
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (id !== null && !UUID.test(id)) return { error: NO_HULL };

  const name = patch.name.trim().slice(0, 80);
  if (!name) return { error: "A hull needs a name." };
  const capacity = Number(patch.capacity);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 2000) return { error: "Capacity is a whole number of people, 0 to 2000." };
  if (patch.home_city && !UUID.test(patch.home_city)) return { error: "Pick the home city off the list." };
  const opt = (v: string, lo: number, hi: number, what: string): number | null | string => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : `${what} is a whole number between ${lo} and ${hi}.`;
  };
  const length = opt(patch.length_ft, 1, 1000, "Length");
  const year = opt(patch.year, 1900, 2100, "Year");
  const cabins = opt(patch.cabins, 0, 200, "Cabins");
  for (const v of [length, year, cabins]) if (typeof v === "string") return { error: v };
  const rate = patch.day_rate.trim() === "" ? null : Math.round(Number(patch.day_rate) * 100);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) return { error: "The day rate is dollars, or blank until the contract says." };
  if (rate !== null && rate > DAY_RATE_MAX_DOLLARS * 100) {
    return { error: `The day rate is dollars, up to ${DAY_RATE_MAX_DOLLARS.toLocaleString("en-US")} — check the figure.` };
  }

  const row = {
    name,
    capacity,
    home_city: patch.home_city || null,
    day_rate_cents: rate,
    length_ft: length as number | null,
    year: year as number | null,
    cabins: cabins as number | null,
    active: patch.active,
  };
  const { data, error } = id
    ? await supabase.from("vessels").update(row).eq("id", id).select("id")
    : await supabase.from("vessels").insert(row).select("id");
  if (error) {
    /* The one foreign key on a hull: a home city struck since the page loaded. */
    return { error: error.code === "23503" ? "That home city is no longer on the chart — pick another." : ERR_LAND };
  }
  if (id && !data?.length) return { error: NO_HULL };
  return done();
}
