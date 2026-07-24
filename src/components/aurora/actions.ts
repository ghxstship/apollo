"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AuroraBerth = { voyageId: string; title: string; startsAt: string };
export type AuroraSailing = { id: string; title: string; startsAt: string; berthsLeft: number };

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/* My soonest aboard berth — Aurora reads it, never guesses. */
export async function auroraNextBerth(): Promise<{ error?: string; berth?: AuroraBerth | null }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("voyage_id")
    .eq("profile_id", userId)
    .eq("status", "aboard");
  const ids = (rsvps ?? []).map((r) => r.voyage_id);
  if (ids.length === 0) return { berth: null };
  const { data: voyages } = await supabase
    .from("voyages")
    .select("id,title,starts_at")
    .in("id", ids)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);
  const v = voyages?.[0];
  return { berth: v ? { voyageId: v.id, title: v.title, startsAt: v.starts_at } : null };
}

/* Three soonest open sailings with berths left. */
export async function auroraSailings(): Promise<{ error?: string; sailings?: AuroraSailing[] }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const [voyagesRes, capacityRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("id,title,starts_at,berths_total")
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase.from("voyage_capacity").select("*"),
  ]);
  const left = new Map(
    (capacityRes.data ?? [])
      .filter((c): c is typeof c & { voyage_id: string } => !!c.voyage_id)
      .map((c) => [c.voyage_id, c.berths_left ?? 0])
  );
  return {
    sailings: (voyagesRes.data ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      startsAt: v.starts_at,
      berthsLeft: left.get(v.id) ?? v.berths_total,
    })),
  };
}

/* Release my berth — same semantics as the manifest's release action. */
export async function auroraReleaseBerth(voyageId: string): Promise<{ error?: string }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: "That didn't land. Try again." };
  revalidatePath("/manifest");
  revalidatePath("/home-port");
  revalidatePath("/gateway");
  return {};
}

/* Release by slug — the LLM brain speaks in slugs; resolve, then release. */
export async function auroraReleaseBerthBySlug(slug: string): Promise<{ error?: string }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { data: voyage } = await supabase
    .from("voyages")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!voyage) return { error: "No such sailing on the manifest." };
  return auroraReleaseBerth(voyage.id);
}

/* Knots + member account, straight off the ledgers. (fathoms_balance is the
   legacy DB name — display is Knots.) */
export async function auroraBalance(): Promise<{
  error?: string;
  knots?: number;
  accountCents?: number;
}> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const [knRes, accRes] = await Promise.all([
    supabase.from("fathoms_balance").select("*").eq("profile_id", userId).maybeSingle(),
    supabase.from("account_balance").select("*").eq("profile_id", userId).maybeSingle(),
  ]);
  return {
    knots: knRes.data?.balance ?? 0,
    accountCents: accRes.data?.balance_cents ?? 0,
  };
}

/* Weather holds on sailings I hold a berth or list spot for. */
export async function auroraWeather(): Promise<{
  error?: string;
  holds?: Array<{ title: string; startsAt: string }>;
}> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("voyage_id,status")
    .eq("profile_id", userId)
    .in("status", ["aboard", "waitlist"]);
  const ids = (rsvps ?? []).map((r) => r.voyage_id);
  if (ids.length === 0) return { holds: [] };
  const { data: voyages } = await supabase
    .from("voyages")
    .select("title,starts_at")
    .in("id", ids)
    .eq("status", "weather_hold")
    .order("starts_at", { ascending: true });
  return {
    holds: (voyages ?? []).map((v) => ({ title: v.title, startsAt: v.starts_at })),
  };
}
