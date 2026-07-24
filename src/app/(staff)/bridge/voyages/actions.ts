"use server";

import { revalidatePath } from "next/cache";
import type { EventClass, MembershipTier, VoyageStatus } from "@/lib/supabase/types";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/voyages");
  revalidatePath("/bridge/manifests");
  revalidatePath("/manifest");
  revalidatePath("/home-port");
  revalidatePath("/gateway");
  revalidatePath("/voyages");
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
  distanceNm: number | null;
  berths: number;
  priceCents: number;
  minTier: MembershipTier;
  media: string;
  depositRequired: boolean;
  itinerary: ItineraryLeg[];
};

export async function createVoyage(input: NewVoyageInput): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const title = input.title.trim();
  if (!slug || !title) return { error: "A voyage needs a slug and a title." };
  if (!input.startsAt) return { error: "Set a departure time." };
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { error: "That departure time doesn't parse." };

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
