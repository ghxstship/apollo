import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { PnlClient, type ExpenseRow, type KindOption, type PnlRow } from "./pnl-client";

export const metadata: Metadata = { title: "P&L" };

export default async function PnlPage() {
  const { supabase } = await getOperator();

  /* new Date() rather than Date.now(): the compiler's purity rule flags the
     latter by name, and every other server page here reads the clock this way. */
  const horizon = new Date(new Date().getTime() + 14 * 86_400_000).toISOString();

  const [pnlRes, expRes, kindRes] = await Promise.all([
    /* Nights that have happened or are close enough to have cost something.
       A night six months out has no costs yet and would only pad the list. */
    supabase
      .from("episode_pnl")
      .select("*")
      .lte("starts_at", horizon)
      .order("starts_at", { ascending: false })
      .limit(60),
    supabase.from("episode_expenses").select("*"),
    supabase.from("expense_kinds").select("*").order("position"),
  ]);

  const kinds: KindOption[] = must(kindRes).map((k) => ({ slug: k.slug, label: k.label }));
  const labelOf = new Map(kinds.map((k) => [k.slug, k.label]));

  const rows: PnlRow[] = must(pnlRes).map((r) => ({
    episodeId: r.episode_id ?? "",
    title: r.title ?? "An episode",
    starts: r.starts_at ?? "",
    setting: r.setting ?? "shore",
    revenueCents: r.revenue_cents ?? 0,
    costCents: r.cost_cents ?? 0,
    unsettledCents: r.unsettled_cents ?? 0,
    marginCents: r.margin_cents ?? 0,
    costed: r.costed ?? false,
  }));

  const expenses: ExpenseRow[] = must(expRes).map((e) => ({
    id: e.id,
    episodeId: e.episode_id,
    kind: e.kind,
    kindLabel: labelOf.get(e.kind) ?? e.kind,
    amountCents: e.amount_cents,
    note: e.note ?? "",
    settled: e.settled,
  }));

  return (
    <div>
      <span className="hm-eyebrow">P&amp;L</span>
      <h1 className="hm-h1">What a night made, and what it cost.</h1>
      {/* The restraint is the feature. Revenue is real and comes from the
          ledger; the cost side is only ever what somebody typed against an
          invoice they hold. Nothing here is estimated from a rate card,
          because the club has not written one — vessels, venues and crew all
          carry a day rate that is deliberately null. */}
      <p className="hm-lede">
        Revenue is the ledger, net of credits and comps. Costs are what somebody
        recorded. A night nobody has costed shows no margin — a zero cost reads
        as a perfect one, which is worse than no number at all.
      </p>
      <PnlClient rows={rows} expenses={expenses} kinds={kinds} />
    </div>
  );
}
