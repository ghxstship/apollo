"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* The filter set is stored verbatim as the segment's jsonb — one shape, so a
   saved view reloads exactly as it was left. */
export type SegmentFilters = {
  harbor: string;
  tier: string;
  plan: string;
  league: string;
  status: string;
  dues: string;
  recent: boolean;
  q: string;
};

export async function saveSegment(name: string, filters: SegmentFilters): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const label = name.trim();
  if (!label) return { error: "Give the view a name first." };
  const { error } = await supabase
    .from("saved_segments")
    .insert({ name: label, filters, created_by: staffId });
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/members");
  return {};
}

export async function removeSegment(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("saved_segments").delete().eq("id", id);
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/members");
  return {};
}

export type MemberDetail = {
  name: string;
  memberNo: string;
  email: string;
  phone: string;
  handle: string;
  joined: string;
  planLine: string;
  duesLine: string;
  knotsBalance: number;
  knotsRecent: Array<{ id: string; reason: string; delta: number; when: string }>;
  passes: Array<{ id: string; title: string; when: string; status: string }>;
  balanceCents: number;
  status: string;
};

/* Pulled on row click rather than shipped with every row — fourteen members
   today, thousands later, and the table should not carry the ledger. */
export async function loadMember(
  profileId: string
): Promise<{ detail?: MemberDetail; error?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const [profileRes, knotsRes, balanceRes, accountRes, passesRes, subRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase
      .from("fathoms_ledger")
      .select("id, delta, reason, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("fathoms_balance").select("balance").eq("profile_id", profileId).maybeSingle(),
    supabase
      .from("account_balance")
      .select("balance_cents")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("rsvps")
      .select("id, status, created_at, voyage_id")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("subscriptions")
      .select("status, interval, current_period_end, cancel_at_period_end, plan_id")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  if (!profile) return { error: "No such member on the roll." };

  const voyageIds = [...new Set((passesRes.data ?? []).map((r) => r.voyage_id))];
  const { data: voyagesData } = voyageIds.length
    ? await supabase.from("voyages").select("id, title, starts_at").in("id", voyageIds)
    : { data: [] as Array<{ id: string; title: string; starts_at: string }> };
  const voyages = new Map((voyagesData ?? []).map((v) => [v.id, v]));

  const planId = subRes.data?.plan_id ?? profile.plan_id;
  const { data: plan } = planId
    ? await supabase
        .from("membership_plans")
        .select("label, price_cents, annual_price_cents")
        .eq("id", planId)
        .maybeSingle()
    : { data: null };

  const sub = subRes.data;
  const duesLine = sub
    ? [
        sub.status.replace("_", " "),
        sub.interval === "year" ? "annual" : "monthly",
        sub.current_period_end
          ? `renews ${new Date(sub.current_period_end).toISOString().slice(0, 10)}`
          : null,
        sub.cancel_at_period_end ? "ends at period close" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No dues on file.";

  return {
    detail: {
      name: profile.full_name ?? "Unnamed member",
      memberNo: profile.member_no ?? "—",
      email: profile.email ?? "—",
      phone: profile.phone ?? "—",
      handle: profile.handle ?? "—",
      joined: profile.joined_at,
      planLine: plan?.label ?? "No plan on file",
      duesLine,
      knotsBalance: balanceRes.data?.balance ?? 0,
      knotsRecent: (knotsRes.data ?? []).map((f) => ({
        id: f.id,
        reason: f.reason,
        delta: f.delta,
        when: f.created_at,
      })),
      passes: (passesRes.data ?? []).map((r) => ({
        id: r.id,
        title: voyages.get(r.voyage_id)?.title ?? "Voyage off the books",
        when: voyages.get(r.voyage_id)?.starts_at ?? r.created_at,
        status: r.status,
      })),
      balanceCents: accountRes.data?.balance_cents ?? 0,
      status: profile.status ?? "active",
    },
  };
}

/* — The two corrections the Bridge actually makes on a member record. Both go
     through definer RPCs or the staff-correction policy; neither is reachable
     from a member's own session. — */

export async function setMemberStatus(
  profileId: string,
  status: "active" | "paused"
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { error } = await supabase.from("profiles").update({ status }).eq("id", profileId);
  if (error) return { error: ERR_LAND };

  /* The member is told by the handle_profile_status trigger, which fires on
     the status change itself — so a member who pauses themselves and one the
     Bridge pauses hear the same single thing. Sending a second word from here
     produced two notifications 114ms apart that disagreed about dues. */

  revalidatePath("/bridge/members");
  return {};
}

export async function adjustKnots(
  profileId: string,
  delta: number,
  reason: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const line = reason.trim();
  if (!line) return { error: "The ledger never writes without a reason." };
  if (!Number.isInteger(delta) || delta === 0) return { error: "A zero adjustment is not an entry." };

  const { error } = await supabase.rpc("adjust_knots", {
    p_profile: profileId,
    p_delta: delta,
    p_reason: line,
  });
  if (error) return { error: error.message };

  revalidatePath("/bridge/members");
  return {};
}
