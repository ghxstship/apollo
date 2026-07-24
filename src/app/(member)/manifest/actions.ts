"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RsvpResult = { error?: string };

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null };
  return { supabase, userId: user.id as string | null };
}

function done(): RsvpResult {
  revalidatePath("/manifest");
  revalidatePath("/harbor");
  revalidatePath("/now");
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
  if (error) return { error: "That didn't land. Try again." };
  return done();
}

export async function setGuests(voyageId: string, guests: number): Promise<RsvpResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const clamped = Math.max(0, Math.min(4, Math.round(guests)));
  const { error } = await supabase
    .from("rsvps")
    .update({ guests: clamped })
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: "That didn't land. Try again." };
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
  if (error) return { error: "That didn't land. Try again." };
  return done();
}
