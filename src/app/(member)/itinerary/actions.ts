"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import { voiceWith } from "@/lib/errors";

/* [un] Limited — the OPTION hold.

   Both verbs go through SECURITY DEFINER functions and neither writes a row
   from here. That is not ceremony: the 72 hours and the capacity count are the
   entire rule, and a member who could INSERT into charter_options could set
   their own expiry to next season. The table takes no INSERT or UPDATE grant
   from `authenticated` at all, so this is the only door.

   Refusals come back in the club's voice through voiceWith(), which asks
   is_active() before it decides what to blame — a paused membership and a full
   cabin are different refusals and telling a member the wrong one sends them to
   a page where nothing is wrong. */

export type OptionResult = { error?: string; heldUntil?: string };

export async function holdCabinOnOption(episodeId: string, cabinId: string): Promise<OptionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const db = moduleTables(supabase);
  const { data, error } = await db.rpc("hold_a_cabin_on_option", {
    p_episode: episodeId,
    p_cabin: cabinId,
  });
  /* The function already refuses in the club's register and says more than a
     generic line could — which cabin is spoken for, how many places it has,
     that a hold is already running. Passing that through beats replacing it. */
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/itinerary");
  return { heldUntil: typeof data === "string" ? data : undefined };
}

export async function releaseCabinOption(optionId: string): Promise<OptionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const db = moduleTables(supabase);
  const { error } = await db.rpc("release_charter_option", { p_option: optionId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/itinerary");
  return {};
}
