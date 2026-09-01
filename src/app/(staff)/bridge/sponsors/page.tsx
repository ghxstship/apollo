import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDate, price } from "@/lib/format";
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

  const [sponsorsRes, activationsRes, voyagesRes, tiersRes] = await Promise.all([
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
  ]);

  const sponsors = must(sponsorsRes);
  const activations = must(activationsRes);
  const voyages = must(voyagesRes);
  const tiers = must(tiersRes);
  const voyageById = new Map(voyages.map((v) => [v.id, v]));
  const tierBySlug = new Map(tiers.map((t) => [t.slug, t]));

  /* Who signed them — a name on the row, not a uuid. */
  const signerIds = [...new Set(sponsors.map((s) => s.created_by).filter((id): id is string => !!id))];
  const signersRes = signerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", signerIds)
    : { data: [] };
  const signerName = new Map(must(signersRes).map((p) => [p.id, p.full_name ?? "Bridge"]));

  const bySponsor = new Map<string, SponsorItem["activations"]>();
  for (const a of activations) {
    const v = voyageById.get(a.voyage_id);
    const list = bySponsor.get(a.sponsor_id) ?? [];
    list.push({
      voyageId: a.voyage_id,
      label: v ? `${v.title} · ${logDate(v.starts_at, v.time_zone)}` : "A sailing off the board",
      placement: a.placement,
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
      <p
        className="ls-mono-data"
        style={{ marginTop: 16, color: "var(--text-2)", textTransform: "uppercase" }}
      >
        {/* price(0) says COMPLIMENTARY, which is a pass, not a ledger figure. */}
        {monthlyTotal ? price(monthlyTotal) : "$0"} this month · {earning.length} in term ·{" "}
        {activeCount} active {activeCount === 1 ? "retainer" : "retainers"}
      </p>
      <SponsorsClient
        rows={items}
        tiers={cards}
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
