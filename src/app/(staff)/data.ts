import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Profile = Tables<"profiles">;
export type Voyage = Tables<"voyages">;
export type Rsvp = Tables<"rsvps">;
export type VoyageCapacity = Tables<"voyage_capacity">;
export type Application = Tables<"applications">;
export type MemberRoll = Tables<"member_roll">;
export type AccountLedger = Tables<"account_ledger">;
export type ShopOrder = Tables<"shop_orders">;
export type WardroomFlag = Tables<"wardroom_flags">;
export type WardroomPost = Tables<"wardroom_posts">;
export type GalleyItem = Tables<"galley_items">;
export type CrewRole = Tables<"crew_roles">;
export type CrewCandidate = Tables<"crew_candidates">;

/* One authenticated operator context per request — layout and pages share it.
   RLS is the real gate; this is the door. */
export const getOperator = cache(async () => {
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
  if (!profile?.is_staff) redirect("/home");

  return { supabase, user, profile };
});

/* Voyage conditions live in a jsonb column — read the four we chart. */
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
