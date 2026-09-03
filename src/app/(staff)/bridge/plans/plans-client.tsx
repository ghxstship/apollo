"use client";

import React from "react";
import { Badge, Button, Input, StateBlock, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { setPlanPricing } from "./actions";

export type PlanRow = {
  id: string;
  label: string;
  planType: string;
  tier: number;
  priceCents: number;
  annualCents: number | null;
  creditCents: number;
  priceId: string | null;
  annualPriceId: string | null;
  published: boolean;
  holders: number;
};

/* The one screen standing between the club and any dues at all.

   A tier without a Stripe price id cannot be subscribed to — /api/stripe/subscribe
   refuses it by name — and every one of the five was null. The row is red until
   it has one, because that is not a warning, it is the tier being unsellable. */
export function PlansClient({ plans, stripeLive }: { plans: PlanRow[]; stripeLive: boolean }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [draft, setDraft] = React.useState<Record<string, { m: string; y: string }>>(() =>
    Object.fromEntries(
      plans.map((p) => [p.id, { m: p.priceId ?? "", y: p.annualPriceId ?? "" }])
    )
  );

  const save = (p: PlanRow) => {
    const d = draft[p.id];
    startTransition(async () => {
      const res = await setPlanPricing(p.id, {
        stripe_price_id: d.m,
        stripe_price_id_annual: d.y,
      });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: `${p.label} priced.`, meta: "DUES" });
    });
  };

  const paid = plans.filter((p) => p.priceCents > 0);
  const unsellable = paid.filter((p) => !p.priceId).length;

  return (
    <>
      {!stripeLive ? (
        <StateBlock
          status="error"
          icon="TriangleAlert"
          title="Stripe is not configured on this deployment."
          detail="Price ids can be recorded here, but nothing will charge until the Stripe keys are set."
        />
      ) : null}

      {unsellable > 0 ? (
        <StateBlock
          status="error"
          icon="TriangleAlert"
          title={
            unsellable === paid.length
              ? "No tier can be paid for."
              : `${unsellable} of ${paid.length} paid tiers cannot be paid for.`
          }
          detail="A tier with no Stripe price id refuses at checkout by name. Create the price in Stripe, then paste its id here."
        />
      ) : null}

      <div className="hm-plans">
        {plans.map((p) => {
          const d = draft[p.id];
          const dirty = d.m !== (p.priceId ?? "") || d.y !== (p.annualPriceId ?? "");
          const blocked = p.priceCents > 0 && !p.priceId;
          return (
            <div key={p.id} className={"hm-plan" + (blocked ? " hm-plan--blocked" : "")}>
              <div className="hm-plan__head">
                <b>{p.label}</b>
                <span className="hm-mono">
                  {p.priceCents === 0
                    ? "COMPLIMENTARY"
                    : `$${(p.priceCents / 100).toLocaleString()} / MO`}
                  {p.creditCents > 0
                    ? ` · $${(p.creditCents / 100).toLocaleString()} CREDIT`
                    : ""}
                </span>
                {blocked ? <Badge tone="danger">Cannot be paid for</Badge> : null}
                {!p.published ? <Badge tone="outline">Unpublished</Badge> : null}
                <span className="hm-plan__holders hm-mono">
                  {p.holders} {p.holders === 1 ? "HOLDER" : "HOLDERS"}
                </span>
              </div>

              {p.priceCents > 0 ? (
                <div className="hm-plan__ids">
                  <Input
                    label="Stripe price — monthly"
                    placeholder="price_…"
                    value={d.m}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], m: e.target.value } }))
                    }
                  />
                  <Input
                    label="Stripe price — annual"
                    placeholder={p.annualCents ? "price_…" : "no annual price set"}
                    value={d.y}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], y: e.target.value } }))
                    }
                  />
                  <Button
                    variant={dirty ? "gold" : "outline"}
                    size="sm"
                    disabled={pending || !dirty}
                    onClick={() => save(p)}
                  >
                    {dirty ? "Save" : "Saved"}
                  </Button>
                </div>
              ) : (
                <p className="hm-note">
                  Nothing to price — this tier is free and never reaches checkout.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
