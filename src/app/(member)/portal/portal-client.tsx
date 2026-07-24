"use client";

import React from "react";
import { Badge, Button, Toast } from "@/components/ds";
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
        <Button variant="brass" size="sm" disabled={pending} onClick={redeem}>
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
          tone="laurel"
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
