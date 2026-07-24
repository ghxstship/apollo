import type { Metadata } from "next";
import { Badge, Progress, Stat, StateBlock, Table } from "@/components/ds";
import { fathoms, logDate } from "@/lib/format";
import { firstName, getMember } from "../data";
import { CopyCode } from "./copy-code";

export const metadata: Metadata = { title: "Portal" };

const REWARDS = [
  {
    name: "First call on scarce berths",
    cost: 250,
    desc: "Your RSVP window opens before the manifest does.",
  },
  {
    name: "Guest berth, any salon",
    cost: 400,
    desc: "Bring one ashore, outside your tier allowance.",
  },
  {
    name: "The crossing draw",
    cost: 1000,
    desc: "A name in the hat for the season's long crossing.",
  },
] as const;

type LedgerRow = {
  id: string;
  created_at: string;
  reason: string;
  delta: number;
  [key: string]: unknown;
};

export default async function PortalPage() {
  const { supabase, user, profile } = await getMember();

  const [balanceRes, ledgerRes] = await Promise.all([
    supabase.from("fathoms_balance").select("*").eq("profile_id", user.id).maybeSingle(),
    supabase
      .from("fathoms_ledger")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const balance = balanceRes.data?.balance ?? 0;
  const ledger: LedgerRow[] = (ledgerRes.data ?? []).map((r) => ({ ...r }));

  const nextReward = REWARDS.find((r) => r.cost > balance) ?? REWARDS[REWARDS.length - 1];
  const progress = Math.min(100, (balance / nextReward.cost) * 100);

  const digits = profile?.member_no?.split("-")[1] ?? "0000";
  const inviteCode = `LYR-${digits}-${firstName(profile).toUpperCase()}`;

  return (
    <div>
      <span className="mbr-eyebrow">Member portal</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        The fathoms ledger.
      </h1>

      <div className="ptl-hero">
        <div>
          <Progress
            inverse
            thick
            label={`Toward ${nextReward.name.toLowerCase()}`}
            detail={`${balance} / ${nextReward.cost} FM`}
            value={progress}
          />
          <p style={{ fontSize: 13, color: "var(--text-inverse-2)", marginTop: 14, maxWidth: "46ch" }}>
            Fathoms are earned under sail, ashore, and by bringing good people.
            Miles, not likes.
          </p>
        </div>
        <Stat inverse label="Fathoms balance" value={fathoms(balance)} sub="MILES, NOT LIKES" />
      </div>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Rewards
        </span>
        <div className="ptl-rew">
          {REWARDS.map((r) => (
            <div key={r.name} className="ptl-panel" style={{ marginTop: 0 }}>
              <div className="mbr-mono">{r.cost} FM</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 8 }}>
                {r.name}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 8 }}>{r.desc}</p>
              <div style={{ marginTop: 14 }}>
                {balance >= r.cost ? (
                  <Badge tone="laurel">Earned</Badge>
                ) : (
                  <Badge tone="outline">{r.cost - balance} short</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Bring a good one
        </span>
        <div className="ptl-panel">
          <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
            Good for one salon as your guest. The rest is on them.
          </p>
          <CopyCode code={inviteCode} />
        </div>
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          The full ledger
        </span>
        {ledger.length === 0 ? (
          <StateBlock
            status="empty"
            icon="BookOpen"
            bare
            title="A clean slate."
            detail="Your first entry lands when you step aboard."
          />
        ) : (
          <div className="ptl-panel" style={{ padding: "8px 20px 12px" }}>
            <Table<LedgerRow>
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  mono: true,
                  width: 90,
                  render: (r) => logDate(r.created_at),
                },
                { key: "reason", label: "Entry" },
                {
                  key: "delta",
                  label: "Fathoms",
                  mono: true,
                  render: (r) => (
                    <span style={{ color: r.delta < 0 ? "var(--siren)" : "var(--laurel)" }}>
                      {r.delta > 0 ? "+" : ""}
                      {fathoms(r.delta)}
                    </span>
                  ),
                },
              ]}
              rows={ledger}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </section>
    </div>
  );
}
