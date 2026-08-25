import "server-only";
import { moduleTables } from "@/lib/module-tables";

/* Charter — the [UN] Limited standard, read.

   Almost everything the charter kit draws already exists here under another
   name, and where that is true this module renames rather than rebuilds:
   the manifest is voyage_manifest(), the cabin is `cabins` under
   guard_cabin_capacity(), the boarding stub is rsvps.boarding_code, and the
   itinerary has lived in voyages.itinerary since the first migration.

   Three things are genuinely new and only three: legs as rows (so a leg can be
   revised and a revision can be timestamped), stops as rows (the 4×6 port guide
   card, which is not a leg — a leg can have none), and the OPTION hold, which
   is the one charter state with no counterpart anywhere in the schema. */

export type LegStatus = "planned" | "revised" | "held";

export interface VoyageLeg {
  id: string;
  voyage_id: string;
  day: number;
  port: string;
  note: string | null;
  starts_at: string | null;
  status: LegStatus;
  hold_reason: string | null;
  hold_new_plan: string | null;
  hold_unchanged: string | null;
  hold_posted_at: string | null;
  posted_at: string;
}

export interface VoyageStop {
  id: string;
  voyage_id: string;
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
  voyage_id: string;
  cabin_id: string;
  expires_at: string;
  taken_at: string;
}

export interface CabinCard {
  id: string;
  name: string;
  berths: number;
  deck: string | null;
  side: string | null;
  muster: string | null;
}

/* The kit's four charter states. CONFIRMED, WAITLIST and CLOSED are already
   rsvp_status and voyage_status under other names; OPTION is the new one, and
   it is a separate table rather than a fifth value on rsvp_status because eight
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

export async function readLegs(supabase: unknown, voyageId: string): Promise<VoyageLeg[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("voyage_legs")
    .select("id,voyage_id,day,port,note,starts_at,status,hold_reason,hold_new_plan,hold_unchanged,hold_posted_at,posted_at")
    .eq("voyage_id", voyageId)
    .order("day");
  return (data ?? []) as VoyageLeg[];
}

export async function readStops(supabase: unknown, voyageId: string): Promise<VoyageStop[]> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("voyage_stops")
    .select("id,voyage_id,leg_id,position,name,tender_at,last_return,notes")
    .eq("voyage_id", voyageId)
    .order("position");
  return (data ?? []) as VoyageStop[];
}

/* Counted through a definer, never by reading charter_options directly. The
   difference is the difference between "Cabin 06 has one place left" and
   "Mara is thinking about Cabin 06" — a member is owed the first and owed none
   of the second. */
export async function readCabinPlaces(supabase: unknown, voyageId: string): Promise<CabinPlace[]> {
  const db = moduleTables(supabase);
  const { data } = await db.rpc("cabin_places_open", { p_voyage: voyageId });
  return (data ?? []) as CabinPlace[];
}

export async function readMyOption(supabase: unknown, voyageId: string): Promise<CharterOption | null> {
  const db = moduleTables(supabase);
  const { data } = await db
    .from("charter_options")
    .select("id,voyage_id,cabin_id,expires_at,taken_at")
    .eq("voyage_id", voyageId)
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
    .select("id,name,berths,deck,side,muster")
    .eq("id", cabinId)
    .maybeSingle();
  return (data ?? null) as CabinCard | null;
}
