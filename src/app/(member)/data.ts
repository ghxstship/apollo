import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Profile = Tables<"profiles">;
/* What one member sees of another — narrower than their own Profile on
   purpose: no email, phone, calendar token, stripe id or plan. */
export type DirectoryMember = Tables<"member_directory">;
export type City = Tables<"cities">;
export type Episode = Tables<"episodes">;
export type Pass = Tables<"passes">;
export type Notification = Tables<"notifications">;
export type EpisodeCapacity = Tables<"episode_capacity">;

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

  /* A hold is a first-class state, not a flag one banner happens to read.
     RLS refuses a held member's writes; the UI owes them the reason. */
  const onHold = (profile?.status ?? "active") !== "active";

  /* The clock this member reads their own account on — their home harbour's,
     unless they have said otherwise. Before this existed, every personal
     timestamp rendered in whatever zone the render host sat in: on a UTC host
     that is 19.6% of a member's own statement lines dated to the wrong day,
     always the day after, since every harbour here is behind UTC.

     null is a real answer (a member with no home harbour yet) and the
     formatter reads it as the club's own clock rather than the machine's. */
  const zone: string | null = profile?.time_zone ?? null;

  return { supabase, user, profile: profile ?? null, onHold, zone };
});

export function firstName(profile: Profile | null): string {
  const n = profile?.full_name?.trim();
  return n ? n.split(/\s+/)[0] : "sailor";
}
