import type { Metadata } from "next";
import { Progress, Stat, StateBlock, Table, type LedgerEntry } from "@/components/ds";
import { CLUB_ZONE, CURRENCY, knots, LEAGUES, LEDGER_KIND } from "@/lib/brand";
import { logDate, roman, yearIn } from "@/lib/format";
import { stripeEnabled } from "@/lib/stripe";
import { getMember } from "../data";
import { CopyCode } from "./copy-code";
import { KnotsPanel, MintInvite } from "./portal-client";
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
  const { supabase, user, profile, onHold, zone } = await getMember();
  const { settled } = await searchParams;

  const [balanceRes, ledgerRes, rewardsRes, redemptionsRes, inviteRes, accountRes, accountBalRes, leagueRes] =
    await Promise.all([
      supabase.from("fathoms_balance").select("*").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("fathoms_ledger")
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
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
      supabase.from("member_league").select("*").eq("profile_id", user.id).maybeSingle(),
    ]);

  const balance = balanceRes.data?.balance ?? 0;
  const ledger: LedgerRow[] = (ledgerRes.data ?? []).map((r) => ({ ...r }));
  /* Kit ledger rows — the minus is the kit's U+2212, which it colors muted. */
  const entries: LedgerEntry[] = ledger.map((r) => ({
    reason: r.reason,
    delta: (r.delta < 0 ? "\u2212" : "+") + knots(Math.abs(r.delta)),
    date: logDate(r.created_at, zone),
  }));
  const rewards = rewardsRes.data ?? [];
  const rewardName = new Map(rewards.map((r) => [r.id, r.name]));
  const redemptions = redemptionsRes.data ?? [];
  const invite = inviteRes.data ?? null;
  const account: AccountRow[] = (accountRes.data ?? []).map((r) => ({ ...r }));
  const accountBalance = accountBalRes.data?.balance_cents ?? 0;
  const leagueNo = leagueRes.data?.league ?? 1;
  const leagueName = leagueRes.data?.league_name ?? LEAGUES[0].name;
  const joinedYear = profile?.joined_at
    ? yearIn(profile.joined_at, CLUB_ZONE)
    : new Date().getFullYear();

  const nextReward =
    rewards.find((r) => r.cost_fm > balance) ?? rewards[rewards.length - 1] ?? null;
  const progress = nextReward ? Math.min(100, (balance / nextReward.cost_fm) * 100) : 100;

  return (
    <div>
      <span className="mbr-eyebrow">Member portal</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        The knots ledger.
      </h1>

      <div className="ptl-hero">
        <div>
          <Progress
            inverse
            thick
            label={nextReward ? `Toward ${nextReward.name.toLowerCase()}` : "The horizon"}
            /* The ratio said "523 / 1000 KN" in 10px beside a 36px balance
               already saying 523 — the page stated the same number twice at
               wildly different weights and never stated the one a member
               actually wants, which is how many are left to go. */
            detail={
              nextReward
                ? `${Math.max(0, nextReward.cost_fm - balance)} ${CURRENCY.code} TO GO · ${nextReward.cost_fm} ${CURRENCY.code}`
                : `${balance} ${CURRENCY.code}`
            }
            value={progress}
          />
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-inverse-2)", marginTop: 14, maxWidth: "46ch" }}>
            Knots are earned under sail, ashore, and by bringing good people.
            {" "}{CURRENCY.line}
          </p>
        </div>
        <Stat inverse label="Knots balance" value={knots(balance)} sub="MORE KNOTS, FARTHER WATER" />
      </div>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Leagues
        </span>
        <div className="ptl-panel">
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{leagueName}</div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: 8, maxWidth: "46ch" }}>
            Knots are earned and spent; leagues only deepen. The longer aboard,
            the deeper you ride.
          </p>
          <p className="mbr-mono" style={{ marginTop: 10 }}>
            MEMBER SINCE {roman(joinedYear)} — {leagueName.toUpperCase()}
          </p>
          <div style={{ marginTop: 16 }}>
            {LEAGUES.map((l) => {
              const here = l.league === leagueNo;
              return (
                <div
                  key={l.league}
                  aria-current={here ? "true" : undefined}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "7px 0",
                    borderTop: "1px solid var(--line-faint)",
                    fontSize: "var(--text-sm)",
                    color: here ? "var(--text-1)" : "var(--text-3)",
                    fontWeight: here ? 600 : 400,
                  }}
                >
                  <span>
                    {l.name}
                    {here ? " — your depth" : ""}
                  </span>
                  <span className="mbr-mono">
                    {l.months === 0 ? "FROM BOARDING" : `${l.months} MO ABOARD`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mbr-sec">
        <span className="mbr-eyebrow" style={{ color: "var(--text-3)" }}>
          Knots and rewards
        </span>
        {ledger.length === 0 && rewards.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Anchor"
            bare
            title="A clean slate."
            detail="Your first entry lands when you step aboard. The rewards shelf is being restocked."
          />
        ) : (
          <div className="ptl-panel">
            <KnotsPanel
              onHold={onHold}
              balance={balance}
              entries={entries}
              rewards={rewards.map((r) => ({
                id: r.id,
                name: r.name,
                cost: knots(r.cost_fm),
                costValue: r.cost_fm,
              }))}
            />
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
                  fontSize: "var(--text-sm)",
                }}
              >
                <span>{rewardName.get(rd.reward_id) ?? "A reward"}</span>
                <span className="mbr-mono">{logDate(rd.created_at, zone)}</span>
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
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginBottom: 14 }}>
            Good for one night ashore as your guest. The rest is on them.
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
          Account statement
        </span>
        {account.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Receipt"
            bare
            title="Nothing on the account."
            detail="Passes, deposits, and add-ons post here as house charges."
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
                  render: (r) => logDate(r.created_at, zone),
                },
                {
                  key: "memo",
                  label: "Entry",
                  render: (r) => r.memo ?? (LEDGER_KIND[r.kind] ?? r.kind).toUpperCase(),
                },
                { key: "kind", label: "Kind", mono: true, width: 90, render: (r) => (LEDGER_KIND[r.kind] ?? r.kind).toUpperCase() },
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
                Settled at the gangway or by invoice — Shoreside posts payments.
              </p>
            )}
          </div>
        )}
        {settled === "1" ? <SettledNotice /> : null}
      </section>
    </div>
  );
}
