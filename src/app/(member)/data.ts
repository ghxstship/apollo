import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Profile = Tables<"profiles">;
export type Harbor = Tables<"harbors">;
export type Voyage = Tables<"voyages">;
export type Rsvp = Tables<"rsvps">;
export type Notification = Tables<"notifications">;
export type VoyageCapacity = Tables<"voyage_capacity">;

export const TIER_RANK: Record<string, number> = {
  regional: 0,
  national: 1,
  global: 2,
};

/* One authenticated context per request — layout and page share it. */
export const getMember = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile: profile ?? null };
});

export function firstName(profile: Profile | null): string {
  const n = profile?.full_name?.trim();
  return n ? n.split(/\s+/)[0] : "sailor";
}
