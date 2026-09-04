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
  /* Named guests a pass may carry, 0–6. */
  guestAllowance: number;
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
  const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
  const [draft, setDraft] = React.useState<
    Record<string, { m: string; y: string; price: string; annual: string; guests: string }>
  >(() =>
    Object.fromEntries(
      plans.map((p) => [
        p.id,
        { m: p.priceId ?? "", y: p.annualPriceId ?? "", price: dollars(p.priceCents), annual: dollars(p.annualCents), guests: String(p.guestAllowance) },
      ])
    )
  );

  const save = (p: PlanRow) => {
    const d = draft[p.id];
    const priceCents = Math.round(Number(d.price) * 100);
    const annualCents = d.annual.trim() === "" ? null : Math.round(Number(d.annual) * 100);
    const priceMoved = priceCents !== p.priceCents || annualCents !== p.annualCents;
    const guests = Math.round(Number(d.guests));
    const guestsMoved = guests !== p.guestAllowance;
    /* The displayed price and the Stripe price are two different records. Say
       so at the moment they are about to diverge, not on the statement. */
    if (
      priceMoved &&
      !window.confirm(
        `This changes what members are quoted, not what Stripe charges. Change the Stripe price behind ${p.label} as well, or the two will disagree. Save it?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await setPlanPricing(p.id, {
        stripe_price_id: d.m,
        stripe_price_id_annual: d.y,
        ...(priceMoved ? { price_cents: priceCents, annual_price_cents: annualCents } : {}),
        ...(guestsMoved ? { guest_allowance: guests } : {}),
      });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: `${p.label} priced.`, meta: "DUES" });
    });
  };

  const setPublished = (p: PlanRow, published: boolean) => {
    startTransition(async () => {
      const res = await setPlanPricing(p.id, { published });
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: published ? `${p.label} is on the membership page.` : `${p.label} is off the membership page.`, meta: "DUES" });
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
          const dirty =
            d.m !== (p.priceId ?? "") ||
            d.y !== (p.annualPriceId ?? "") ||
            d.price !== dollars(p.priceCents) ||
            d.annual !== dollars(p.annualCents) ||
            d.guests !== String(p.guestAllowance);
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
                  {` · ${p.guestAllowance} ${p.guestAllowance === 1 ? "GUEST" : "GUESTS"} A PASS`}
                </span>
                {blocked ? <Badge tone="danger">Cannot be paid for</Badge> : null}
                {!p.published ? <Badge tone="outline">Unpublished</Badge> : null}
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setPublished(p, !p.published)}>
                  {p.published ? "Take off the page" : "Put on the page"}
                </Button>
                <span className="hm-plan__holders hm-mono">
                  {p.holders} {p.holders === 1 ? "HOLDER" : "HOLDERS"}
                </span>
              </div>

              {p.priceCents > 0 ? (
                <div className="hm-plan__ids">
                  <Input
                    label="Quoted — monthly ($)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={d.price}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], price: e.target.value } }))
                    }
                  />
                  <Input
                    label="Quoted — annual ($)"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="no annual price"
                    value={d.annual}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], annual: e.target.value } }))
                    }
                  />
                  <Input
                    label="Guests a pass"
                    type="number"
                    min={0}
                    max={6}
                    step={1}
                    value={d.guests}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], guests: e.target.value } }))
                    }
                  />
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
                <div className="hm-plan__ids">
                  <Input
                    label="Guests a pass"
                    type="number"
                    min={0}
                    max={6}
                    step={1}
                    value={d.guests}
                    onChange={(e) =>
                      setDraft((s) => ({ ...s, [p.id]: { ...s[p.id], guests: e.target.value } }))
                    }
                  />
                  <p className="hm-note hm-plan__free">
                    Nothing to price — this tier is free and never reaches checkout. The guest count
                    still reads on the pass.
                  </p>
                  <Button
                    variant={dirty ? "gold" : "outline"}
                    size="sm"
                    disabled={pending || !dirty}
                    onClick={() => save(p)}
                  >
                    {dirty ? "Save" : "Saved"}
                  </Button>
                </div>
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
