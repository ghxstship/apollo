import type { Metadata } from "next";
import { Stat, Table } from "@/components/ds";
import { price } from "@/lib/format";
import { getOperator } from "../../data";

export const metadata: Metadata = { title: "Reports" };

type FillRow = {
  id: string;
  title: string;
  fill: string;
  nm: string;
  fathoms: string;
  [key: string]: unknown;
};

export default async function ReportsPage() {
  const { supabase } = await getOperator();

  const seasonStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const nowIso = new Date().toISOString();

  const [
    profilesRes,
    voyagesRes,
    capacityRes,
    ledgerRes,
    rollRes,
    fathomsRes,
    weatherRes,
    outboxRes,
  ] = await Promise.all([
    supabase.from("profiles").select("status, joined_at"),
    supabase.from("voyages").select("id, title, distance_nm, kind, status, starts_at"),
    supabase.from("voyage_capacity").select("*"),
    supabase
      .from("account_ledger")
      .select("delta_cents, created_at")
      .lt("delta_cents", 0)
      .gte("created_at", seasonStart),
    supabase.from("member_roll").select("invite_code"),
    supabase.from("fathoms_ledger").select("voyage_id, delta").not("voyage_id", "is", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("kind", "weather"),
    supabase.from("email_outbox").select("status"),
  ]);

  /* Members */
  const profiles = profilesRes.data ?? [];
  const activeMembers = profiles.filter((p) => p.status === "active").length;
  const newThisSeason = profiles.filter((p) => p.joined_at >= seasonStart).length;

  /* Berth fill — past + live, non-cancelled */
  const voyages = voyagesRes.data ?? [];
  const capacity = new Map(
    (capacityRes.data ?? []).filter((c) => c.voyage_id).map((c) => [c.voyage_id as string, c])
  );
  const sailed = voyages.filter(
    (v) =>
      v.status !== "cancelled" &&
      (v.status === "completed" || v.status === "live" || v.starts_at <= nowIso)
  );
  const sailedAboard = sailed.reduce((t, v) => t + (capacity.get(v.id)?.aboard ?? 0), 0);
  const sailedBerths = sailed.reduce(
    (t, v) => t + (capacity.get(v.id)?.berths_total ?? 0),
    0
  );
  const fillPct = sailedBerths ? Math.round((sailedAboard / sailedBerths) * 100) : 0;

  /* House account — charge volume this season */
  const houseCents = (ledgerRes.data ?? []).reduce((t, l) => t + Math.abs(l.delta_cents), 0);

  /* Referrals */
  const roll = rollRes.data ?? [];
  const referred = roll.filter((r) => r.invite_code).length;
  const referralPct = roll.length ? Math.round((referred / roll.length) * 100) : 0;

  /* Fathoms paid per voyage */
  const fathomsByVoyage = new Map<string, number>();
  for (const f of fathomsRes.data ?? []) {
    if (!f.voyage_id || f.delta <= 0) continue;
    fathomsByVoyage.set(f.voyage_id, (fathomsByVoyage.get(f.voyage_id) ?? 0) + f.delta);
  }

  /* Holds */
  const holdsLive = voyages.filter((v) => v.status === "weather_hold").length;
  const weatherNotices = weatherRes.count ?? 0;

  /* Outbox health */
  const outbox = outboxRes.data ?? [];
  const outboxCount = (s: string) => outbox.filter((e) => e.status === s).length;

  const fillRows: FillRow[] = voyages
    .filter((v) => v.status !== "cancelled")
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
    .map((v) => {
      const c = capacity.get(v.id);
      return {
        id: v.id,
        title: v.title,
        fill: `${c?.aboard ?? 0}/${c?.berths_total ?? 0}`,
        nm: v.distance_nm != null ? String(v.distance_nm) : "—",
        fathoms: (fathomsByVoyage.get(v.id) ?? 0).toLocaleString("en-US"),
      };
    });

  return (
    <div>
      <span className="hm-eyebrow">Reports</span>
      <h1 className="hm-h1">The season, in numbers.</h1>

      <div className="hm-row">
        <Stat
          label="Members"
          value={activeMembers}
          sub={`+${newThisSeason} THIS SEASON`}
        />
        <Stat
          label="Berth fill"
          value={`${fillPct}%`}
          sub={`${sailed.length} VOYAGES SAILED OR LIVE`}
        />
        <Stat
          label="House account"
          value={houseCents ? price(houseCents) : "$0"}
          sub="CHARGES THIS SEASON"
        />
        <Stat
          label="Referral joins"
          value={`${referralPct}%`}
          sub={`${referred} OF ${roll.length} ON THE ROLL`}
        />
      </div>

      <div className="hm-row">
        <Stat
          size="sm"
          label="Holds"
          value={holdsLive}
          sub={`${weatherNotices} WEATHER NOTICES SENT`}
        />
        <Stat
          size="sm"
          label="Outbox"
          value={outboxCount("pending")}
          sub={`PENDING · ${outboxCount("sent")} SENT · ${outboxCount("skipped")} SKIPPED · ${outboxCount("failed")} FAILED`}
        />
      </div>

      <section className="hm-sec">
        <h2>Voyage by voyage.</h2>
        <div className="hm-panel">
          <Table
            rowKey={(r: FillRow) => r.id}
            columns={[
              { key: "title", label: "Voyage" },
              { key: "fill", label: "Fill", mono: true, width: 90 },
              { key: "nm", label: "NM", mono: true, width: 70 },
              { key: "fathoms", label: "Fathoms paid", mono: true, width: 120 },
            ]}
            rows={fillRows}
          />
          {fillRows.length === 0 ? (
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: 13 }}>
              No voyages on the books yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
