"use server";

import { revalidatePath } from "next/cache";
import type { EventClass, MembershipTier, VoyageStatus } from "@/lib/supabase/types";
import { wallClockInZone } from "@/lib/format";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/voyages");
  revalidatePath("/bridge/manifests");
  revalidatePath("/manifest");
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/charters");
  return {};
}

/* Status transitions fan out via triggers — weather_hold reaches every berth
   by email and the Word tab; completed banks the knots. Confirm-first UI. */
export async function setVoyageStatus(
  voyageId: string,
  status: VoyageStatus
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("voyages").update({ status }).eq("id", voyageId);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setBerthsTotal(voyageId: string, berths: number): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const clamped = Math.max(0, Math.min(96, Math.round(berths)));
  const { error } = await supabase
    .from("voyages")
    .update({ berths_total: clamped })
    .eq("id", voyageId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Operator holds — held passes come off sale, so capacity for sale is
   berths_total − held_passes. Clamped to what the voyage actually carries. */
export async function setHeldPasses(voyageId: string, held: number): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { data: voyage } = await supabase
    .from("voyages")
    .select("berths_total")
    .eq("id", voyageId)
    .maybeSingle();
  if (!voyage) return { error: ERR_LAND };
  const clamped = Math.max(0, Math.min(voyage.berths_total, Math.round(held)));
  const { error } = await supabase
    .from("voyages")
    .update({ held_passes: clamped })
    .eq("id", voyageId);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function saveVoyageOps(
  voyageId: string,
  conditions: { wind: string; swell: string; heading: string; speed: string },
  muster: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const clean = Object.fromEntries(
    Object.entries(conditions)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v)
  );
  const { error } = await supabase
    .from("voyages")
    .update({ conditions: clean, muster: muster.trim() || null })
    .eq("id", voyageId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* — The flotilla. voyage_vessels has had readers since the fleet landed
     ("the flotilla is public") and a "staff write flotilla" ALL policy
     (is_staff USING and WITH CHECK) that no code ever exercised — so the
     manifests screen's "spread across the flotilla" dead-ended on "No yachts
     assigned to this voyage yet" with no way to assign one. These two are that
     policy's writer. — */

export async function assignVessel(
  voyageId: string,
  vesselId: string,
  position: number
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!vesselId) return { error: "Pick a hull first." };

  const { error } = await supabase.from("voyage_vessels").insert({
    voyage_id: voyageId,
    vessel_id: vesselId,
    position: Math.max(1, Math.round(position) || 1),
  });
  if (error) {
    /* The primary key is (voyage_id, vessel_id) — the only duplicate this
       shape can raise is the same hull twice. */
    if (error.code === "23505") return { error: "That hull is already on this voyage." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function removeVessel(voyageId: string, vesselId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("voyage_vessels")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("vessel_id", vesselId);
  if (error) return { error: ERR_LAND };
  return done();
}

export type SubClass = "voyage" | "expedition" | "odyssey" | "trek" | "excursion" | "overland";
export type ItineraryLeg = { offset: number; title: string; note: string };

export type NewVoyageInput = {
  slug: string;
  title: string;
  cls: EventClass;
  subClass: SubClass | null;
  kind: string;
  harborId: string | null;
  startsAt: string;
  endsAt: string;
  distanceNm: number | null;
  berths: number;
  priceCents: number;
  minTier: MembershipTier;
  media: string;
  depositRequired: boolean;
  itinerary: ItineraryLeg[];
};

/* One <input type="datetime-local"> value, resolved on a named clock. Null when
   the string is not a wall clock at all — the caller says which field it was. */
function onHarbourClock(local: string, zone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const at = new Date(
    wallClockInZone(
      Number(m[1]), Number(m[2]), Number(m[3]),
      Number(m[4]), Number(m[5]),
      zone
    )
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function createVoyage(input: NewVoyageInput): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const title = input.title.trim();
  if (!slug || !title) return { error: "A voyage needs a slug and a title." };
  if (!input.startsAt) return { error: "Set a departure time." };
  /* A sailing with no return time can never round the marks that are measured
     in hours: confer_marks skips any voyage where ends_at is null, so
     long-passage (8h aboard) and night-reckoning (still out at the harbour's
     midnight) were unreachable for every voyage the Bridge has ever set. The
     ICS feed was inventing a three-hour window for the same reason. Neither is
     a guess the operator has to leave us to make — they know when the boat is
     due back at the moment they set the departure. */
  if (!input.endsAt) return { error: "Set a return time — the marks are measured in hours." };
  if (!input.harborId) return { error: "Pick a harbor — the departure time is read on its clock." };

  /* The form's <input type="datetime-local"> yields "2027-05-15T19:00" with NO
     OFFSET, so `new Date()` resolves it in the NODE SERVER'S zone — while the
     Harbor select sits in the same row of the same form, and a trigger stamps
     the voyage with that harbour's zone milliseconds later. Every surface then
     renders the instant on the harbour's clock.

     On a UTC production host an operator scheduling Chicago 19:00 stored 19:00Z
     and the product published it as 14:00 CDT: five hours early, on the public
     charter page, the ICS feed, the manifest, the boarding code's MMDD, and
     every 48h/window/18:00 boundary derived from it. The harbour's zone is
     known at the moment of authoring; it just was not consulted. */
  const { data: harbor } = await supabase
    .from("harbors")
    .select("time_zone")
    .eq("id", input.harborId)
    .maybeSingle();
  if (!harbor) return { error: "That harbor is not on the chart." };

  const startsAt = onHarbourClock(input.startsAt, harbor.time_zone);
  if (!startsAt) return { error: "That departure time doesn't parse." };
  /* Read on the SAME clock as the departure. Mix the two — one on the harbour's
     wall, one on the server's — and the stored passage is off by the offset
     between them, which is how eight hours aboard becomes seven and the mark
     goes unrounded. wallClockInZone also carries both readings across a DST
     night, so a sail that leaves before the clocks move and returns after them
     is the length it actually was. */
  const endsAt = onHarbourClock(input.endsAt, harbor.time_zone);
  if (!endsAt) return { error: "That return time doesn't parse." };
  if (endsAt.getTime() <= startsAt.getTime())
    return { error: "The return has to come after the departure." };

  /* Itinerary rows: minutes from cast off, a title, an optional note. */
  const itinerary = (input.itinerary ?? [])
    .map((leg) => ({
      offset: Math.round(Number(leg.offset) || 0),
      title: String(leg.title ?? "").trim(),
      note: String(leg.note ?? "").trim(),
    }))
    .filter((leg) => leg.title);

  const { error } = await supabase.from("voyages").insert({
    slug,
    title,
    class: input.cls,
    sub_class: input.subClass,
    itinerary,
    kind: input.kind.trim() || (input.cls === "shore" ? "port_day" : "sea_day"),
    harbor_id: input.harborId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    distance_nm: input.distanceNm,
    berths_total: Math.max(1, Math.min(96, Math.round(input.berths))),
    price_cents: Math.max(0, Math.round(input.priceCents)),
    min_tier: input.minTier,
    media: input.media,
    deposit_required: input.depositRequired,
  });
  if (error) return { error: ERR_LAND };
  return done();
}
