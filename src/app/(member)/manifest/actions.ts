"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RsvpResult = { error?: string; full?: boolean };

type Supa = Awaited<ReturnType<typeof createClient>>;

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null };
  return { supabase, userId: user.id as string | null };
}

/* The database guards speak in brand voice already ("the manifest is full —
   join the waitlist"). Surface the message near-verbatim, sentence-cased. */
function guardMessage(raw: string | null | undefined): string {
  const m = (raw ?? "").trim();
  if (!m) return "That didn't land. Try again.";
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
}

function isFullMessage(raw: string | null | undefined): boolean {
  return (raw ?? "").toLowerCase().includes("full");
}

function done(): RsvpResult {
  revalidatePath("/manifest");
  revalidatePath("/home-port");
  revalidatePath("/gateway");
  return {};
}

function clampGuests(guests: number): number {
  return Math.max(0, Math.min(2, Math.round(guests)));
}

/* Names as the manifest reads them — trimmed, sized to the guest count. */
function cleanNames(names: string[], count: number): string[] {
  return names
    .slice(0, count)
    .map((n) => n.trim())
    .filter(Boolean);
}

/* Attach add-ons to an rsvp: one rsvp_addons row plus one account_ledger
   'addon' charge each (the triggers do not cover these). Already-attached
   add-ons are skipped. Returns a raw error message, or null on success. */
async function attachAddons(
  supabase: Supa,
  userId: string,
  voyageId: string,
  rsvpId: string,
  addonIds: string[],
  qty: number
): Promise<string | null> {
  const [{ data: addons }, { data: already }] = await Promise.all([
    supabase.from("addons").select("*").in("id", addonIds).eq("active", true),
    supabase.from("rsvp_addons").select("addon_id").eq("rsvp_id", rsvpId),
  ]);
  const attached = new Set((already ?? []).map((a) => a.addon_id));

  for (const addon of addons ?? []) {
    if (attached.has(addon.id)) continue;
    const { error: rowError } = await supabase
      .from("rsvp_addons")
      .insert({ rsvp_id: rsvpId, addon_id: addon.id, qty });
    if (rowError) return rowError.message;
    const { error: chargeError } = await supabase.from("account_ledger").insert({
      profile_id: userId,
      delta_cents: -(addon.price_cents * qty),
      kind: "addon",
      memo: addon.name,
      voyage_id: voyageId,
      rsvp_id: rsvpId,
    });
    if (chargeError) return chargeError.message;
  }
  return null;
}

export async function setRsvpStatus(
  voyageId: string,
  status: "aboard" | "waitlist" | "not_going"
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { voyage_id: voyageId, profile_id: userId, status },
      { onConflict: "voyage_id,profile_id" }
    );
  if (error) return { error: guardMessage(error.message), full: isFullMessage(error.message) };
  return done();
}

/* Review & confirm on a priced voyage: the pass (house charge posts by
   trigger) with guest names on the rsvp, then any chosen add-ons. */
export async function confirmBerth(
  voyageId: string,
  addonIds: string[],
  guests: number,
  guestNames: string[]
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };

  const clamped = clampGuests(guests);
  const { error } = await supabase
    .from("rsvps")
    .upsert(
      {
        voyage_id: voyageId,
        profile_id: userId,
        status: "aboard",
        guests: clamped,
        guest_names: cleanNames(guestNames, clamped),
      },
      { onConflict: "voyage_id,profile_id" }
    );
  if (error) return { error: guardMessage(error.message), full: isFullMessage(error.message) };

  if (addonIds.length > 0) {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id, guests")
      .eq("voyage_id", voyageId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (rsvp) {
      const failed = await attachAddons(
        supabase,
        userId,
        voyageId,
        rsvp.id,
        addonIds,
        1 + (rsvp.guests ?? 0)
      );
      if (failed) return { error: guardMessage(failed) };
    }
  }

  revalidatePath("/portal");
  return done();
}

/* Post-purchase add-on upsell — open until 18:00 the night before departure. */
export async function improvePass(voyageId: string, addonIds: string[]): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  if (addonIds.length === 0) return {};

  const { data: voyage } = await supabase
    .from("voyages")
    .select("starts_at")
    .eq("id", voyageId)
    .maybeSingle();
  if (!voyage) return { error: "That voyage is off the manifest." };
  const starts = new Date(voyage.starts_at);
  const cutoff = new Date(
    starts.getFullYear(),
    starts.getMonth(),
    starts.getDate() - 1,
    18,
    0,
    0,
    0
  );
  if (Date.now() >= cutoff.getTime()) {
    return { error: "The add-on window closed at 18:00 the night before." };
  }

  const { data: rsvp } = await supabase
    .from("rsvps")
    .select("id, guests, status")
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (!rsvp || rsvp.status !== "aboard") return { error: "Confirm your pass first." };

  const failed = await attachAddons(
    supabase,
    userId,
    voyageId,
    rsvp.id,
    addonIds,
    1 + (rsvp.guests ?? 0)
  );
  if (failed) return { error: guardMessage(failed) };

  revalidatePath("/portal");
  return done();
}

export async function setGuests(
  voyageId: string,
  guests: number,
  guestNames: string[]
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const clamped = clampGuests(guests);
  const { error } = await supabase
    .from("rsvps")
    .update({ guests: clamped, guest_names: cleanNames(guestNames, clamped) })
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: guardMessage(error.message) };
  return done();
}

export async function releaseBerth(voyageId: string): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: guardMessage(error.message) };
  revalidatePath("/portal");
  return done();
}
