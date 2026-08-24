"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProducerHold = { voyageId: string; title: string; startsAt: string; zone: string };
export type ProducerSailing = { id: string; title: string; startsAt: string; zone: string; berthsLeft: number };

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/* My soonest aboard berth — the Producer reads it, never guesses. */
export async function producerNextBerth(): Promise<{ error?: string; berth?: ProducerHold | null }> {
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
    .select("id,title,starts_at,time_zone")
    .in("id", ids)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);
  const v = voyages?.[0];
  return { berth: v ? { voyageId: v.id, title: v.title, startsAt: v.starts_at, zone: v.time_zone } : null };
}

/* Three soonest sailings this member can ACTUALLY take.

   It used to filter on status and date alone, so the Producer offered
   "Chicago: the founding night · 79 PASSES LEFT · RESERVE" to a member whose
   own manifest said "THE WINDOW OPENS MAR 31 ON YOUR PLAN". The assistant
   contradicting the product it is embedded in is worse than the assistant
   saying nothing: the member believes the assistant and finds the door shut.
   Same three tests the manifest applies — tier rank, class ceiling, and the
   plan's booking window. */
export async function producerSailings(): Promise<{ error?: string; sailings?: ProducerSailing[] }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };

  const { data: me } = await supabase
    .from("profiles")
    .select("tier,status,plan_id")
    .eq("id", userId)
    .maybeSingle();
  const { data: plan } = me?.plan_id
    ? await supabase
        .from("membership_plans")
        .select("early_days,class_ceiling")
        .eq("id", me.plan_id)
        .maybeSingle()
    : { data: null };

  const RANK: Record<string, number> = { regional: 1, national: 2, global: 3 };
  const myRank = RANK[me?.tier ?? "regional"] ?? 1;
  const onHold = me?.status !== "active";
  const earlyDays = plan?.early_days ?? 0;
  const ceiling = plan?.class_ceiling ?? null;
  const CLASS_RANK: Record<string, number> = { voyage: 1, expedition: 2, odyssey: 3 };

  const [voyagesRes, capacityRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("id,title,starts_at,berths_total,time_zone,min_tier,sub_class")
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(12),
    supabase.from("voyage_capacity").select("*"),
  ]);
  const left = new Map(
    (capacityRes.data ?? [])
      .filter((c): c is typeof c & { voyage_id: string } => !!c.voyage_id)
      .map((c) => [c.voyage_id, c.berths_left ?? 0])
  );
  /* A member on hold can take nothing, so say nothing rather than offer. */
  if (onHold) return { sailings: [] };

  const nowMs = Date.now();
  return {
    sailings: (voyagesRes.data ?? [])
      .filter((v) => (RANK[v.min_tier] ?? 0) <= myRank)
      .filter((v) => {
        if (!ceiling || !v.sub_class || !(v.sub_class in CLASS_RANK)) return true;
        return (CLASS_RANK[v.sub_class] ?? 0) <= (CLASS_RANK[ceiling] ?? 3);
      })
      .filter((v) => nowMs >= new Date(v.starts_at).getTime() - earlyDays * 86400000)
      .filter((v) => (left.get(v.id) ?? v.berths_total) > 0)
      .slice(0, 3)
      .map((v) => ({
        id: v.id,
        title: v.title,
        startsAt: v.starts_at, zone: v.time_zone,
        berthsLeft: left.get(v.id) ?? v.berths_total,
      })),
  };
}

/* Release my berth — same semantics as the manifest's release action. */
export async function producerReleaseBerth(voyageId: string): Promise<{ error?: string }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("profile_id", userId);
  if (error) return { error: "That didn't land. Try again." };
  revalidatePath("/manifest");
  revalidatePath("/home");
  revalidatePath("/live");
  return {};
}

/* Release by slug — the LLM brain speaks in slugs; resolve, then release. */
export async function producerReleaseBerthBySlug(slug: string): Promise<{ error?: string }> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { data: voyage } = await supabase
    .from("voyages")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!voyage) return { error: "No such sailing on the manifest." };
  return producerReleaseBerth(voyage.id);
}

/* Knots + member account, straight off the ledgers. (fathoms_balance is the
   legacy DB name — display is Knots.) */
export async function producerBalance(): Promise<{
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
export async function producerWeather(): Promise<{
  error?: string;
  holds?: Array<{ title: string; startsAt: string; zone: string }>;
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
    .select("title,starts_at,time_zone")
    .in("id", ids)
    .eq("status", "weather_hold")
    .order("starts_at", { ascending: true });
  return {
    holds: (voyages ?? []).map((v) => ({ title: v.title, startsAt: v.starts_at, zone: v.time_zone })),
  };
}
