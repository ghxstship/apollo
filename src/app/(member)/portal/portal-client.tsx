"use client";

import React from "react";
import { Badge, Button, KnotsLedger, Toast, type LedgerEntry, type LedgerReward } from "@/components/ds";
import { mintInvite, redeemReward } from "./actions";

/* — Redeem a reward against the knots balance — */
export function RedeemButton({
  rewardId,
  rewardName,
  affordable,
  short,
}: {
  rewardId: string;
  rewardName: string;
  affordable: boolean;
  short: number;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [redeemed, setRedeemed] = React.useState(false);

  const redeem = () => {
    setError(null);
    startTransition(async () => {
      const res = await redeemReward(rewardId);
      if (res.error) setError(res.error);
      else setRedeemed(true);
    });
  };

  return (
    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {affordable ? (
        <Button variant="gold" size="sm" disabled={pending} onClick={redeem}>
          Redeem
        </Button>
      ) : (
        <Badge tone="outline">{short} short</Badge>
      )}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--siren)" }}>
          {error}
        </span>
      ) : null}
      {redeemed ? (
        <Toast
          fixed
          tone="positive"
          message="Redeemed. Shoreside will make it so."
          meta={rewardName}
          onDismiss={() => setRedeemed(false)}
        />
      ) : null}
    </div>
  );
}

/* — Mint the member's real invite code — */
export function MintInvite() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const mint = () => {
    setError(null);
    startTransition(async () => {
      const res = await mintInvite();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Button variant="outline" size="sm" disabled={pending} onClick={mint}>
        Mint invite code
      </Button>
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--siren)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* — The kit's KnotsLedger, wired to redeem_reward. Balance, the running
   ledger, and the Slop Chest rewards in the kit's single arrangement. — */
export function KnotsPanel({
  balance,
  entries,
  rewards,
  onHold = false,
}: {
  balance: number;
  entries: LedgerEntry[];
  rewards: (LedgerReward & { id: string })[];
  /* A held membership keeps its ledger and reads it; spending waits. */
  onHold?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [redeemed, setRedeemed] = React.useState<string | null>(null);

  return (
    <>
      <KnotsLedger
        balance={balance}
        entries={entries}
        rewards={rewards}
        onRedeem={onHold ? undefined : (r) => {
          if (pending) return;
          setError(null);
          startTransition(async () => {
            const res = await redeemReward((r as LedgerReward & { id: string }).id);
            if (res.error) setError(res.error);
            else setRedeemed(r.name);
          });
        }}
      />
      {error ? (
        <span role="alert" style={{ display: "block", marginTop: 10, fontSize: 12, color: "var(--siren)" }}>
          {error}
        </span>
      ) : null}
      {redeemed ? (
        <Toast
          fixed
          tone="positive"
          message="Redeemed. Shoreside will make it so."
          meta={redeemed}
          onDismiss={() => setRedeemed(null)}
        />
      ) : null}
    </>
  );
}
