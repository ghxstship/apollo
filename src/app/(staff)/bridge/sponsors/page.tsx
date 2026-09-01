import type { Metadata } from "next";
import { logDate, price } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { SponsorsClient, type SponsorItem } from "./sponsors-client";
import type { SponsorTier } from "./actions";

export const metadata: Metadata = { title: "Sponsors" };

export default async function SponsorsPage() {
  const { supabase } = await getOperator();

  const [sponsorsRes, activationsRes, voyagesRes] = await Promise.all([
    supabase.from("sponsors").select("*").order("created_at", { ascending: true }),
    supabase.from("voyage_sponsors").select("*"),
    /* One voyages read serves both jobs: titles for whatever is already
       placed — a credit may sit on a sailing that has since sailed — and the
       picker below, which offers only sailings that can still carry one. */
    supabase
      .from("voyages")
      .select("id, title, starts_at, time_zone, status")
      .order("starts_at", { ascending: true }),
  ]);

  const sponsors = must(sponsorsRes);
  const activations = must(activationsRes);
  const voyages = must(voyagesRes);
  const voyageById = new Map(voyages.map((v) => [v.id, v]));

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
    tier: s.tier as SponsorTier,
    monthlyCents: s.monthly_cents,
    contactEmail: s.contact_email,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    notes: s.notes,
    active: s.active,
    activations: bySponsor.get(s.id) ?? [],
  }));

  /* The figure the book exists to answer: what the retainers bring in a
     month, counting only names still on it. */
  const monthlyTotal = sponsors
    .filter((s) => s.active)
    .reduce((sum, s) => sum + s.monthly_cents, 0);
  const activeCount = sponsors.filter((s) => s.active).length;

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
        {monthlyTotal ? price(monthlyTotal) : "$0"} monthly · {activeCount} active{" "}
        {activeCount === 1 ? "retainer" : "retainers"}
      </p>
      <SponsorsClient
        rows={items}
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
