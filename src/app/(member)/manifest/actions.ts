"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RsvpResult = { error?: string; full?: boolean };

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

/* Review & confirm on a priced voyage: berth (house charge posts by trigger),
   then any chosen add-ons — rsvp_addons rows plus one account_ledger charge
   per add-on, which the triggers do not cover. */
export async function confirmBerth(
  voyageId: string,
  addonIds: string[]
): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };

  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { voyage_id: voyageId, profile_id: userId, status: "aboard" },
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
      const qty = 1 + (rsvp.guests ?? 0);
      const [{ data: addons }, { data: already }] = await Promise.all([
        supabase.from("addons").select("*").in("id", addonIds).eq("active", true),
        supabase.from("rsvp_addons").select("addon_id").eq("rsvp_id", rsvp.id),
      ]);
      const attached = new Set((already ?? []).map((a) => a.addon_id));

      for (const addon of addons ?? []) {
        if (attached.has(addon.id)) continue;
        const { error: rowError } = await supabase
          .from("rsvp_addons")
          .insert({ rsvp_id: rsvp.id, addon_id: addon.id, qty });
        if (rowError) return { error: guardMessage(rowError.message) };
        const { error: chargeError } = await supabase.from("account_ledger").insert({
          profile_id: userId,
          delta_cents: -(addon.price_cents * qty),
          kind: "addon",
          memo: addon.name,
          voyage_id: voyageId,
          rsvp_id: rsvp.id,
        });
        if (chargeError) return { error: guardMessage(chargeError.message) };
      }
    }
  }

  revalidatePath("/portal");
  return done();
}

export async function setGuests(voyageId: string, guests: number): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const clamped = Math.max(0, Math.min(2, Math.round(guests)));
  const { error } = await supabase
    .from("rsvps")
    .update({ guests: clamped })
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
