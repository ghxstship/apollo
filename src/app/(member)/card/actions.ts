"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CardResult = { error?: string };

/* The season feed is public by secret: /api/calendar/[token] answers anybody
   holding the address, which is what makes it work in every calendar client and
   what makes it dangerous once it has been pasted somewhere it shouldn't be.
   This page has warned about that for as long as it has shown the address, and
   until now the warning was all there was — no way to take one back.

   rotate_calendar_token issues a new token for the caller's own row and nothing
   else. The old address stops resolving the moment the new one is written, so a
   member who shared theirs by accident has a way to shut it, not just a sentence
   telling them they should not have. */
export async function rotateSeasonFeed(): Promise<CardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("rotate_calendar_token");
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/card");
  return {};
}
