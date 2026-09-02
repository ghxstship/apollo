import "server-only";
import { moduleTables } from "@/lib/module-tables";

/* Charter — the [un] Limited standard, read.

   Almost everything the charter kit draws already exists here under another
   name, and where that is true this module renames rather than rebuilds:
   the manifest is episode_manifest(), the cabin is `cabins` under
   guard_cabin_capacity(), the boarding stub is passes.boarding_code, and the
   itinerary has lived in episodes.itinerary since the first migration.

   Three things are genuinely new and only three: legs as rows (so a leg can be
   revised and a revision can be timestamped), stops as rows (the 4×6 place guide
   card, which is not a leg — a leg can have none), and the OPTION hold, which
   is the one charter state with no counterpart anywhere in the schema. */

export type LegStatus = "planned" | "revised" | "held";

export interface EpisodeLeg {
  id: string;
  episode_id: string;
  day: number;
  place: string;
  note: string | null;
  starts_at: string | null;
  status: LegStatus;
  hold_reason: string | null;
  hold_new_plan: string | null;
  hold_unchanged: string | null;
  hold_posted_at: string | null;
  posted_at: string;
}

export interface EpisodeStop {
  id: string;
  episode_id: string;
  leg_id: string | null;
  position: number;
  name: string;
  tender_at: string | null;
  last_return: string | null;
  notes: string | null;
}

export interface CabinPlace {
  cabin_id: string;
  name: string;
  berths: number;
  taken: number;
  mine: boolean;
}

export interface CharterOption {
  id: string;
  episode_id: string;
  cabin_id: string;
  expires_at: string;
  taken_at: string;
}

export interface CabinCard {
  id: string;
  name: string;
  sleeps: number;
  deck: string | null;
  side: string | null;
  muster: string | null;
}

/* The kit's four episode states. CONFIRMED, WAITLIST and CLOSED are already
   pass_status and episode_status under other names; OPTION is the new one, and
   it is a separate table rather than a fifth value on pass_status because eight
   triggers switch on that enum and every one of them would have to learn that
   this value is not a booking. */
export const CHARTER_STATES: Array<[string, string, string]> = [
  ["Confirmed", "Cabin held, balance paid", "var(--positive)"],
  ["Option", "Held 72 hours, no charge", "var(--caution)"],
  ["Waitlist", "In order, with a claim window", "var(--caution)"],
  ["Closed", "Season sailed", "var(--text-faint)"],
];

export const SIDE_LABEL: Record<string, string> = {
  port: "Port",
  starboard: "Starboard",
  centre: "Centre",
};

export async function readLegs(supabase: unknown, episodeId: string): Promise<EpisodeLeg[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("episode_legs")
    .select("id,episode_id,day,place,note,starts_at,status,hold_reason,hold_new_plan,hold_unchanged,hold_posted_at,posted_at")
    .eq("episode_id", episodeId)
    .order("day");
  return (data ?? []) as EpisodeLeg[];
}

export async function readStops(supabase: unknown, episodeId: string): Promise<EpisodeStop[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("episode_stops")
    .select("id,episode_id,leg_id,position,name,tender_at,last_return,notes")
    .eq("episode_id", episodeId)
    .order("position");
  return (data ?? []) as EpisodeStop[];
}

/* Counted through a definer, never by reading charter_options directly. The
   difference is the difference between "Cabin 06 has one place left" and
   "Mara is thinking about Cabin 06" — a member is owed the first and owed none
   of the second. */
export async function readCabinPlaces(supabase: unknown, episodeId: string): Promise<CabinPlace[]> {
  const db = moduleTables(supabase);
  const { data } = await db.rpc("cabin_places_open", { p_episode: episodeId });
  return (data ?? []) as CabinPlace[];
}

export async function readMyOption(supabase: unknown, episodeId: string): Promise<CharterOption | null> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("charter_options")
    .select("id,episode_id,cabin_id,expires_at,taken_at")
    .eq("episode_id", episodeId)
    .is("released_at", null)
    .is("confirmed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data ?? null) as CharterOption | null;
}

export async function readCabin(supabase: unknown, cabinId: string): Promise<CabinCard | null> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("cabins")
    .select("id,name,sleeps,deck,side,muster")
    .eq("id", cabinId)
    .maybeSingle();
  return (data ?? null) as CabinCard | null;
}
