import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DOOR_HEADER } from "@/lib/supabase/middleware";
import type { Tables } from "@/lib/supabase/types";

export type Profile = Tables<"profiles">;
export type Episode = Tables<"episodes">;
export type Pass = Tables<"passes">;
export type EpisodeCapacity = Tables<"episode_capacity">;
export type Application = Tables<"applications">;
export type MemberRoll = Tables<"member_roll">;
export type AccountLedger = Tables<"account_ledger">;
export type ShopOrder = Tables<"shop_orders">;
export type OpenDeckFlag = Tables<"open_deck_flags">;
export type OpenDeckPost = Tables<"open_deck_posts">;
export type GalleyItem = Tables<"galley_items">;
export type CrewRole = Tables<"crew_roles">;
export type CrewCandidate = Tables<"crew_candidates">;

/* Who is signed in, once per request. Both doors below start here, so the
   layout and the page share one auth round trip and one profile read. */
const signedIn = cache(async () => {
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
  if (!profile) redirect("/home");

  return { supabase, user, profile };
});

/* One authenticated operator context per request — layout and pages share it.
   RLS is the real gate; this is the door.

   Staff pass. A hired door — a crew member holding a live door_grants row and
   not the staff flag — passes ONLY when the proxy has named this request as
   one for /bridge/gangway (see DOOR_HEADER in lib/supabase/middleware.ts).
   The (staff) layout wraps every Bridge screen and reads this before any page
   renders, so without that scoping a door grant would open the shell of every
   console; with it, the same session on /bridge/members is turned away here
   exactly as before. The header is stripped from every request and stamped by
   the proxy alone, so it cannot be supplied by the caller — and it is only a
   condition for asking the database, never the answer: is_door() decides. */
export const getOperator = cache(async () => {
  const ctx = await signedIn();
  if (ctx.profile.is_staff) return { ...ctx, door: false };

  const h = await headers();
  if (h.get(DOOR_HEADER) === "1") {
    const { data: door } = await ctx.supabase.rpc("is_door");
    if (door === true) return { ...ctx, door: true };
  }
  redirect("/home");
});

/* The door's grant on one episode, as the gangway shows it. */
export type DoorGrant = Tables<"door_grants">;

/* The gangway's own door. Used by /bridge/gangway and by nothing else: it
   admits staff, and it admits the holder of an unexpired door grant — the
   hired crew member who works the door for one night and never sees the rest
   of the Bridge. For a door holder it also carries the grants themselves, so
   the page can show exactly the episodes they hold and say when the grant
   runs out. Staff get an empty list: they see the whole board.

   Every gangway server action re-checks is_door(episode) for itself; this
   admits the reader to the screen and no further. */
export const getDoor = cache(async () => {
  const ctx = await signedIn();
  if (ctx.profile.is_staff) {
    return { ...ctx, staff: true as const, grants: [] as DoorGrant[] };
  }

  const { data: door } = await ctx.supabase.rpc("is_door");
  if (door !== true) redirect("/home");

  /* A door reads their own grants (policy "a door reads their own grant").
     Only the live ones: an expired grant is not a grant. */
  const { data: grants } = await ctx.supabase
    .from("door_grants")
    .select("*")
    .eq("profile_id", ctx.user.id)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });

  return { ...ctx, staff: false as const, grants: grants ?? [] };
});

/* Episode conditions live in a jsonb column — read the four we chart. */
export type Conditions = { wind?: string; swell?: string; heading?: string; speed?: string };

export function readConditions(raw: unknown): Conditions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]) : undefined);
  return { wind: pick("wind"), swell: pick("swell"), heading: pick("heading"), speed: pick("speed") };
}

export function conditionsLine(c: Conditions): string {
  const parts = [c.wind, c.swell, c.heading, c.speed].filter(Boolean);
  return parts.length ? parts.join(" · ").toUpperCase() : "NOT LOGGED";
}
