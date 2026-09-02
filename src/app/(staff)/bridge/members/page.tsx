import type { Metadata } from "next";
import { CITY_CODES } from "@/lib/brand";
import { TIER_LABEL } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../../data";
import type { SegmentFilters } from "./actions";
import { MembersClient, type MemberRow, type SegmentOption } from "./members-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Members" };

/* Dues read from the subscription, not the plan cell — a plan is what they
   chose, dues are whether it is being paid. */
const DUES_LABEL: Record<string, string> = {
  none: "No dues",
  active: "Paid up",
  trialing: "Trial",
  past_due: "Past due",
  paused: "Paused",
  canceled: "Ended",
  incomplete: "Incomplete",
};

function readFilters(raw: unknown): SegmentFilters | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return {
    city: str("city"),
    tier: str("tier"),
    plan: str("plan"),
    league: str("league"),
    status: str("status"),
    dues: str("dues"),
    recent: o.recent === true,
    q: str("q"),
  };
}

export default async function MembersPage() {
  const { supabase } = await getOperator();

  /* Fixed on the server so the filter does not drift mid-session. */
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const recentCutoff = cutoffDate.toISOString();

  const [
    profilesRes,
    citiesRes,
    plansRes,
    engagementRes,
    leagueRes,
    subsRes,
    segmentsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").order("joined_at", { ascending: false }),
    supabase.from("cities").select("id, slug, name").order("position", { ascending: true }),
    supabase.from("membership_plans").select("id, label, price_cents, annual_price_cents"),
    supabase.from("member_engagement").select("*"),
    supabase.from("member_league").select("*"),
    supabase.from("subscriptions").select("profile_id, status, plan_id, created_at"),
    supabase.from("saved_segments").select("*").order("created_at", { ascending: false }),
  ]);

  const cities = must(citiesRes);
  const cityById = new Map(cities.map((h) => [h.id, h]));
  const plans = must(plansRes);
  const planById = new Map(plans.map((p) => [p.id, p]));

  const engagement = new Map(
    (must(engagementRes))
      .filter((e) => e.profile_id)
      .map((e) => [e.profile_id as string, e])
  );
  const leagues = new Map(
    (must(leagueRes)).filter((l) => l.profile_id).map((l) => [l.profile_id as string, l])
  );

  /* One member, one dues line — newest subscription row wins. */
  const subs = new Map<string, { status: string; plan_id: string | null }>();
  for (const s of (must(subsRes)).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  )) {
    if (!subs.has(s.profile_id)) subs.set(s.profile_id, { status: s.status, plan_id: s.plan_id });
  }

  const rows: MemberRow[] = (must(profilesRes)).map((p) => {
    const city = p.home_city ? cityById.get(p.home_city) : undefined;
    const sub = subs.get(p.id);
    const planId = sub?.plan_id ?? p.plan_id;
    const plan = planId ? planById.get(planId) : undefined;
    const eng = engagement.get(p.id);
    const lg = leagues.get(p.id);
    const dues = sub?.status ?? "none";
    return {
      id: p.id,
      name: p.full_name ?? "Unnamed member",
      memberNo: memberMark(p.member_no) || "—",
      email: p.email ?? "",
      tier: p.tier,
      tierLabel: TIER_LABEL[p.tier] ?? p.tier,
      planId: planId ?? "",
      planLabel: plan?.label ?? "—",
      league: lg?.league ?? 1,
      leagueName: lg?.league_name ?? "First League — Harborline",
      citySlug: city?.slug ?? "",
      cityCode: city ? (CITY_CODES[city.slug] ?? city.name.slice(0, 3).toUpperCase()) : "—",
      status: p.status,
      dues,
      duesLabel: DUES_LABEL[dues] ?? dues,
      passes: eng?.passes ?? 0,
      attended: eng?.attended ?? 0,
      knots: eng?.knots ?? 0,
      lastBooked: eng?.last_booked_at ?? null,
      staff: p.is_staff,
    };
  });

  const segments: SegmentOption[] = (must(segmentsRes))
    .map((s) => {
      const filters = readFilters(s.filters);
      return filters ? { id: s.id, name: s.name, filters } : null;
    })
    .filter((s): s is SegmentOption => s !== null);

  return (
    <div>
      <span className="hm-eyebrow">Members</span>
      <h1 className="hm-h1">Who is on the roll.</h1>
      <p className="hm-lede">
        Every member, what they pay, how far they have sailed. Narrow it down, save the view for
        next time, take the file with you.
      </p>
      <MembersClient
        rows={rows}
        segments={segments}
        cities={cities.map((h) => ({
          slug: h.slug,
          label: `${CITY_CODES[h.slug] ?? h.name.slice(0, 3).toUpperCase()} — ${h.name}`,
        }))}
        plans={plans.map((p) => ({ id: p.id, label: p.label }))}
        recentCutoff={recentCutoff}
      />
    </div>
  );
}
