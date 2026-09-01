"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { logDate } from "@/lib/format";
import { CLUB_ZONE } from "@/lib/brand";
import { pauseDues, resumeDues, duesNote, liveSubscription } from "@/lib/dues";
import { memberMark } from "@/lib/membership";
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
  phoneVerified: boolean;
  handle: string;
  joined: string;
  planLine: string;
  duesLine: string;
  knotsBalance: number;
  knotsRecent: Array<{ id: string; reason: string; delta: number; when: string }>;
  passes: Array<{ id: string; title: string; when: string; zone: string; status: string }>;
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
    /* Was "newest by created_at, any status", which could hand the drawer a
       CANCELED row while Pause and Depart acted on a live one. One reader now,
       shared with @/lib/dues, so the operator sees the record their own button
       would move. */
    liveSubscription(supabase, profileId),
  ]);

  const profile = profileRes.data;
  if (!profile) return { error: "No such member on the roll." };

  const voyageIds = [...new Set((passesRes.data ?? []).map((r) => r.voyage_id))];
  const { data: voyagesData } = voyageIds.length
    ? await supabase.from("voyages").select("id, title, starts_at, time_zone").in("id", voyageIds)
    : { data: [] as Array<{ id: string; title: string; starts_at: string; time_zone: string }> };
  const voyages = new Map((voyagesData ?? []).map((v) => [v.id, v]));

  const planId = subRes?.plan_id ?? profile.plan_id;
  const { data: plan } = planId
    ? await supabase
        .from("membership_plans")
        .select("label, price_cents, annual_price_cents")
        .eq("id", planId)
        .maybeSingle()
    : { data: null };

  const sub = subRes;
  const duesLine = sub
    ? [
        sub.status.replace("_", " "),
        sub.interval === "year" ? "annual" : "monthly",
        /* Was .toISOString() — UTC. Any period end between 16:00 and midnight
           Pacific rendered to Shoreside as the NEXT day, so a member ringing
           up about "ENDS SEP 14" was looked up against a record that said
           "renews 2026-09-15". The member's own page has always read this in
           the club's zone; the Bridge now reads the same clock. */
        sub.current_period_end
          ? `renews ${logDate(sub.current_period_end, CLUB_ZONE)}`
          : null,
        sub.cancel_at_period_end ? "ends at period close" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No dues on file.";

  return {
    detail: {
      name: profile.full_name ?? "Unnamed member",
      memberNo: memberMark(profile.member_no) || "—",
      email: profile.email ?? "—",
      phone: profile.phone ?? "—",
      phoneVerified: !!profile.phone_verified,
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
        /* The drawer used to read this on the operator's clock, disagreeing
           with every other Bridge console about the same sailing. */
        zone: voyages.get(r.voyage_id)?.time_zone ?? "",
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
     produced two notifications 114ms apart that disagreed about dues.

     But that word says the dues pause, and until now this action changed only
     the standing: a Bridge pause never touched Stripe, so the member read
     "dues pause" while the card kept drawing every period — and, before the
     accompanying migration, could neither resume nor leave. The member-side
     buttons have always moved the dues; the Bridge has to as well, or the two
     doors into the same state mean different things. */
  const dues = status === "paused" ? await pauseDues(profileId) : await resumeDues(profileId);
  const note = duesNote(dues, status === "paused" ? "paused" : "resumed");

  revalidatePath("/bridge/members");
  /* Handed back so the operator sees it, because they are the one who can act
     on it. A failure here must not undo the standing change — the member is
     paused either way, and Shoreside needs to know the card was not. */
  return note && (dues.kind === "not-wired" || dues.kind === "failed") ? { note } : {};
}

/* Marking a number verified. The write goes through verify_member_phone — a
   staff-only definer RPC that opens the app.verify_phone gate the profile
   column guard honours — because the column itself is barred to everyone:
   members are rightly refused from swearing to their own number, and a direct
   staff UPDATE would be stopped by the same guard.

   The RPC's refusals are already in the club's voice ('a number is verified
   from the Bridge'; 'there is no number on file to verify — the member adds
   one on their You page first'), so they pass to the operator as said rather
   than being flattened into ERR_LAND. */
export async function verifyPhone(profileId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { error } = await supabase.rpc("verify_member_phone", { p_profile: profileId });
  if (error) return { error: voice(error) };

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
  /* Three refusals, each saying what actually happened. The one message used
     to cover all three, so a decimal came back as "A zero adjustment is not an
     entry." — which is not what the operator did. */
  if (!Number.isFinite(delta)) return { error: "Knots take a number." };
  if (!Number.isInteger(delta)) return { error: "Knots come in whole numbers." };
  if (delta === 0) return { error: "A zero adjustment is not an entry." };
  /* The column is a 32-bit integer and the field is an unbounded number input,
     so an operator leaning on the keyboard got Postgres's own words back:
     'value "99999999999" is out of range for type integer'. */
  if (Math.abs(delta) > 1_000_000) {
    return { error: "That is more knots than anyone has. Keep it under a million." };
  }

  const { error } = await supabase.rpc("adjust_knots", {
    p_profile: profileId,
    p_delta: delta,
    p_reason: line,
  });
  if (error) return { error: voice(error) };

  revalidatePath("/bridge/members");
  return {};
}
