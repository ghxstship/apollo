import type { Metadata } from "next";
import { getOperator } from "../../data";
import { CodesClient, type CodeRow } from "./codes-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Codes" };

export default async function CodesPage() {
  const { supabase } = await getOperator();

  const [codesRes, voyagesRes] = await Promise.all([
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
    supabase
      .from("voyages")
      .select("id, title, starts_at, status")
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(60),
  ]);

  const voyages = must(voyagesRes);
  const titles = new Map(voyages.map((v) => [v.id, v.title]));

  const rows: CodeRow[] = (must(codesRes)).map((c) => ({
    code: c.code,
    kind: c.kind,
    value: c.value,
    scope: c.voyage_id ? (titles.get(c.voyage_id) ?? "One sailing") : "Any sailing",
    uses: c.uses,
    maxUses: c.max_uses,
    expiresAt: c.expires_at,
    active: c.active,
    note: c.note ?? "",
  }));

  return (
    <div>
      <span className="hm-eyebrow">Codes</span>
      <h1 className="hm-h1">Access and promo codes.</h1>
      <p className="hm-lede">
        Founding-member drops, partner comps, press. A code is either a share off, a sum off, or the
        whole thing complimentary — scoped to one episode or to all of them.
      </p>
      <CodesClient
        rows={rows}
        voyages={voyages.map((v) => ({ id: v.id, title: v.title }))}
      />
    </div>
  );
}
