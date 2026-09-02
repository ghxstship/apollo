import type { Metadata } from "next";
import { Stat } from "@/components/ds";
import { CLUB_ZONE } from "@/lib/brand";
import { logDate, price } from "@/lib/format";
import { memberMark } from "@/lib/membership";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { SponsorsClient, type SponsorItem, type TierCard } from "./sponsors-client";

export const metadata: Metadata = { title: "Sponsors" };

/* Today as the date-only string the term columns are kept in, read on the
   club's own clock — starts_on/ends_on are dates, not instants, and the
   retainer figure is a club-side number. en-CA renders YYYY-MM-DD. */
function clubToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function SponsorsPage() {
  const { supabase } = await getOperator();

  const [sponsorsRes, activationsRes, voyagesRes, tiersRes, compsRes, membersRes] = await Promise.all([
    supabase.from("sponsors").select("*").order("created_at", { ascending: true }),
    supabase.from("voyage_sponsors").select("*"),
    /* One voyages read serves both jobs: titles for whatever is already
       placed — a credit may sit on a sailing that has since sailed — and the
       picker below, which offers only sailings that can still carry one. */
    supabase
      .from("voyages")
      .select("id, title, starts_at, time_zone, status")
      .order("starts_at", { ascending: true }),
    /* The rate card is a table now, not a constant in the client. */
    supabase.from("sponsor_tiers").select("*").order("position", { ascending: true }),
    /* Passes comped on a sponsor's account — rsvps.sponsor_id is stamped by
       comp_a_pass_for_sponsor and by nothing else. */
    supabase
      .from("rsvps")
      .select("id, voyage_id, sponsor_id, profile_id, status, created_at")
      .not("sponsor_id", "is", null)
      .order("created_at", { ascending: true }),
    /* The member picker for a comp: members in standing, by name. */
    supabase
      .from("profiles")
      .select("id, full_name, member_no")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const sponsors = must(sponsorsRes);
  const activations = must(activationsRes);
  const voyages = must(voyagesRes);
  const tiers = must(tiersRes);
  const comps = must(compsRes);
  const members = must(membersRes);
  const voyageById = new Map(voyages.map((v) => [v.id, v]));
  const tierBySlug = new Map(tiers.map((t) => [t.slug, t]));

  /* Who signed them, and who was comped — names on the row, not uuids. One
     profiles read for both; the comped may include a member no longer active,
     who is not in the picker list. */
  const nameIds = [
    ...new Set([
      ...sponsors.map((s) => s.created_by).filter((id): id is string => !!id),
      ...comps.map((c) => c.profile_id),
    ]),
  ];
  const namesRes = nameIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", nameIds)
    : { data: [] };
  const named = must(namesRes);
  const signerName = new Map(named.map((p) => [p.id, p.full_name ?? "Bridge"]));
  const memberName = new Map(named.map((p) => [p.id, p.full_name || memberMark(p.member_no) || "A member"]));

  const compsFor = new Map<string, SponsorItem["activations"][number]["comps"]>();
  for (const c of comps) {
    if (!c.sponsor_id) continue;
    const key = `${c.voyage_id}:${c.sponsor_id}`;
    const list = compsFor.get(key) ?? [];
    list.push({ id: c.id, name: memberName.get(c.profile_id) ?? "A member", status: c.status });
    compsFor.set(key, list);
  }

  const bySponsor = new Map<string, SponsorItem["activations"]>();
  for (const a of activations) {
    const v = voyageById.get(a.voyage_id);
    const list = bySponsor.get(a.sponsor_id) ?? [];
    list.push({
      voyageId: a.voyage_id,
      label: v ? `${v.title} · ${logDate(v.starts_at, v.time_zone)}` : "A sailing off the board",
      placement: a.placement,
      assetsDelivered: a.assets_delivered ?? [],
      comps: compsFor.get(`${a.voyage_id}:${a.sponsor_id}`) ?? [],
      /* A comp is a pass on a sailing, so only a sailing still on the board
         can take one; the credit itself stays whatever the sailing's state. */
      open: v ? v.status === "scheduled" || v.status === "live" : false,
    });
    bySponsor.set(a.sponsor_id, list);
  }

  const items: SponsorItem[] = sponsors.map((s) => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    tierLabel: tierBySlug.get(s.tier)?.label ?? s.tier,
    monthlyCents: s.monthly_cents,
    contactEmail: s.contact_email,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    notes: s.notes,
    active: s.active,
    signedBy: s.created_by ? (signerName.get(s.created_by) ?? "Bridge") : null,
    activations: bySponsor.get(s.id) ?? [],
  }));

  /* The figure the book exists to answer: what the retainers bring in a
     month, counting only names still on it AND inside their term today. A
     retainer signed for next season, or one whose term ran out, is on the
     book but not in this month's money — the same rule sponsor_credits()
     applies to the credit line. */
  const today = clubToday();
  const inTerm = (s: { starts_on: string | null; ends_on: string | null }) =>
    (!s.starts_on || s.starts_on <= today) && (!s.ends_on || s.ends_on >= today);
  const earning = sponsors.filter((s) => s.active && inTerm(s));
  const monthlyTotal = earning.reduce((sum, s) => sum + s.monthly_cents, 0);
  const activeCount = sponsors.filter((s) => s.active).length;

  const cards: TierCard[] = tiers.map((t) => ({
    slug: t.slug,
    label: t.label,
    rateCents: t.rate_cents,
    assets: t.assets ?? [],
  }));

  return (
    <div>
      <span className="hm-eyebrow">Sponsors</span>
      <h1 className="hm-h1">The sponsor book.</h1>
      <p className="hm-lede">
        A sponsor keeps a monthly retainer and gets a credit — a name carried on a
        sailing, never an ad. The terms live here on the Bridge; the shore reads
        names and tiers through one window, and nothing else.
      </p>
      {/* Three figures the book is read for, and they were one run-on line of
          10px mono — the money set exactly like the two counts beside it, in
          the register this console uses for slugs and timestamps. */}
      <div className="hm-row">
        <Stat
          size="sm"
          label="This month"
          /* price(0) says COMPLIMENTARY, which is a pass, not a ledger figure. */
          value={monthlyTotal ? price(monthlyTotal) : "$0"}
          sub="RETAINERS IN TERM"
        />
        <Stat size="sm" label="In term" value={earning.length} />
        <Stat
          size="sm"
          label={activeCount === 1 ? "Active retainer" : "Active retainers"}
          value={activeCount}
        />
      </div>
      <SponsorsClient
        rows={items}
        tiers={cards}
        members={members.map((m) => ({
          value: m.id,
          label: [m.full_name ?? "Unnamed member", memberMark(m.member_no)].filter(Boolean).join(" · "),
        }))}
        voyages={voyages
          .filter((v) => v.status === "scheduled" || v.status === "live")
          .map((v) => ({
            value: v.id,
            label: `${v.title} · ${logDate(v.starts_at, v.time_zone)}`,
          }))}
      />
    </div>
  );
}
