import type { Metadata } from "next";
import { Progress, Stat, StateBlock, Table } from "@/components/ds";
import { fathoms, logDate } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { getMember } from "../data";
import { CopyCode } from "./copy-code";
import { MintInvite, RedeemButton } from "./portal-client";
import { SettleCardButton, SettledNotice } from "./settle-card";

export const metadata: Metadata = { title: "Portal" };

type LedgerRow = {
  id: string;
  created_at: string;
  reason: string;
  delta: number;
  [key: string]: unknown;
};

type AccountRow = {
  id: string;
  created_at: string;
  kind: string;
  memo: string | null;
  delta_cents: number;
  [key: string]: unknown;
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ settled?: string }>;
}) {
  const { supabase, user } = await getMember();
  const { settled } = await searchParams;

  const [balanceRes, ledgerRes, rewardsRes, redemptionsRes, inviteRes, accountRes, accountBalRes] =
    await Promise.all([
      supabase.from("fathoms_balance").select("*").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("fathoms_ledger")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("rewards")
        .select("*")
        .eq("active", true)
        .order("position", { ascending: true }),
      supabase
        .from("reward_redemptions")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invites")
        .select("*")
        .eq("inviter_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("account_ledger")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("account_balance").select("*").eq("profile_id", user.id).maybeSingle(),
    ]);

  const balance = balanceRes.data?.balance ?? 0;
  const ledger: LedgerRow[] = (ledgerRes.data ?? []).map((r) => ({ ...r }));
  const rewards = rewardsRes.data ?? [];
  const rewardName = new Map(rewards.map((r) => [r.id, r.name]));
  const redemptions = redemptionsRes.data ?? [];
  const invite = inviteRes.data ?? null;
  const account: AccountRow[] = (accountRes.data ?? []).map((r) => ({ ...r }));
  const accountBalance = accountBalRes.data?.balance_cents ?? 0;

  const nextReward =
    rewards.find((r) => r.cost_fm > balance) ?? rewards[rewards.length - 1] ?? null;
  const progress = nextReward ? Math.min(100, (balance / nextReward.cost_fm) * 100) : 100;

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
            label={nextReward ? `Toward ${nextReward.name.toLowerCase()}` : "The horizon"}
            detail={nextReward ? `${balance} / ${nextReward.cost_fm} FM` : `${balance} FM`}
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
        {rewards.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Anchor"
            bare
            title="Nothing on offer."
            detail="The rewards shelf is being restocked. Watch the Word."
          />
        ) : (
          <div className="ptl-rew">
            {rewards.map((r) => (
              <div key={r.id} className="ptl-panel" style={{ marginTop: 0 }}>
                <div className="mbr-mono">{r.cost_fm} FM</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginTop: 8 }}>
                  {r.name}
                </div>
                {r.detail ? (
                  <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 8 }}>{r.detail}</p>
                ) : null}
                <RedeemButton
                  rewardId={r.id}
                  rewardName={r.name}
                  affordable={balance >= r.cost_fm}
                  short={Math.max(0, r.cost_fm - balance)}
                />
              </div>
            ))}
          </div>
        )}
        {redemptions.length > 0 ? (
          <div className="ptl-panel" style={{ padding: "16px 20px" }}>
            <span className="mbr-mono" style={{ display: "block", marginBottom: 8 }}>
              REDEEMED
            </span>
            {redemptions.map((rd) => (
              <div
                key={rd.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  fontSize: 13,
                }}
              >
                <span>{rewardName.get(rd.reward_id) ?? "A reward"}</span>
                <span className="mbr-mono">{logDate(rd.created_at)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Bring a good one
        </span>
        <div className="ptl-panel">
          <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
            Good for one salon as your guest. The rest is on them.
          </p>
          {invite ? (
            <>
              <CopyCode code={invite.code} />
              <p className="mbr-mono" style={{ marginTop: 10 }}>
                {invite.uses} OF {invite.max_uses} SIGNATURES OUT
              </p>
            </>
          ) : (
            <MintInvite />
          )}
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

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Account statement
        </span>
        {account.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Receipt"
            bare
            title="Nothing on the account."
            detail="Berths, deposits, and add-ons post here as house charges."
          />
        ) : (
          <div className="ptl-panel" style={{ padding: "8px 20px 16px" }}>
            <Table<AccountRow>
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  mono: true,
                  width: 90,
                  render: (r) => logDate(r.created_at),
                },
                {
                  key: "memo",
                  label: "Entry",
                  render: (r) => r.memo ?? r.kind.toUpperCase(),
                },
                { key: "kind", label: "Kind", mono: true, width: 90, render: (r) => r.kind.toUpperCase() },
                {
                  key: "delta_cents",
                  label: "Amount",
                  mono: true,
                  render: (r) => (
                    <span style={{ color: r.delta_cents < 0 ? "var(--siren)" : "var(--laurel)" }}>
                      {r.delta_cents < 0 ? "−" : "+"}${(Math.abs(r.delta_cents) / 100).toFixed(2)}
                    </span>
                  ),
                },
              ]}
              rows={account}
              rowKey={(r) => r.id}
            />
            <p className="mbr-mono" style={{ marginTop: 12 }}>
              {accountBalance < 0
                ? `BALANCE — $${(Math.abs(accountBalance) / 100).toFixed(2)} DUE`
                : "BALANCE — SETTLED"}
            </p>
            {accountBalance < 0 && stripeEnabled() ? (
              <div style={{ marginTop: 12 }}>
                <SettleCardButton
                  amountLabel={`$${(Math.abs(accountBalance) / 100).toFixed(2)}`}
                />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
                Settled at the gangway or by invoice — the shore office posts payments.
              </p>
            )}
          </div>
        )}
        {settled === "1" ? <SettledNotice /> : null}
      </section>
    </div>
  );
}
