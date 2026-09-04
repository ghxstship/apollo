"use client";

import React from "react";
import { Badge, Button, Dialog, Input, Select, StateBlock, Stat, Toast } from "@/components/ds";
import { price } from "@/lib/format";
import { useToast } from "../../ui";
import { addExpense, removeExpense, settleExpense } from "./actions";

export type PnlRow = {
  episodeId: string;
  title: string;
  starts: string;
  setting: string;
  revenueCents: number;
  costCents: number;
  unsettledCents: number;
  marginCents: number;
  costed: boolean;
};

export type ExpenseRow = {
  id: string;
  episodeId: string;
  kind: string;
  kindLabel: string;
  amountCents: number;
  note: string;
  settled: boolean;
};

export type KindOption = { slug: string; label: string };

/* Per-episode P&L, and the whole design problem is the uncosted night.
 *
 * An episode with no expenses recorded has a cost of zero and therefore a
 * margin of a hundred per cent. Printed in a column beside real revenue that
 * reads as a fact — and it is the most misleading number this schema can
 * produce, because it is most wrong exactly where the club has done least
 * work. So a row that nobody has costed shows no margin at all. Not a zero,
 * not a dash with a footnote: the words "not costed", which are true.
 */
export function PnlClient({
  rows,
  expenses,
  kinds,
}: {
  rows: PnlRow[];
  expenses: ExpenseRow[];
  kinds: KindOption[];
}) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [open, setOpen] = React.useState<PnlRow | null>(null);
  const [kind, setKind] = React.useState(kinds[0]?.slug ?? "other");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [settled, setSettled] = React.useState(false);

  const costed = rows.filter((r) => r.costed);
  const withRevenue = rows.filter((r) => r.revenueCents > 0);
  /* Totalled across costed nights ONLY. Summing margin over uncosted ones would
     reintroduce the same lie at the top of the page. */
  const totalMargin = costed.reduce((t, r) => t + r.marginCents, 0);

  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else show({ msg: ok, meta: "P&L" });
    });

  const save = () => {
    if (!open) return;
    const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
    run(() => addExpense(open.episodeId, kind, cents, note, settled), "Cost recorded.");
    setAmount("");
    setNote("");
  };

  const mine = open ? expenses.filter((e) => e.episodeId === open.episodeId) : [];

  return (
    <>
      <div className="hm-stats">
        <Stat label="Costed" value={`${costed.length} of ${withRevenue.length}`} sub="NIGHTS WITH REVENUE" />
        <Stat
          label="Margin"
          value={costed.length ? price(totalMargin) : "—"}
          sub={costed.length ? "ACROSS COSTED NIGHTS ONLY" : "NOTHING COSTED YET"}
        />
      </div>

      {costed.length === 0 ? (
        <StateBlock
          status="empty"
          icon="Calculator"
          title="No night has been costed."
          detail="Revenue is real; the cost side is empty. Until a night has a cost recorded against it, this page will not print a margin for it — a zero cost reads as a hundred per cent margin, and that is worse than no number."
        />
      ) : null}

      <div className="hm-pnl">
        {rows.map((r) => (
          <div key={r.episodeId} className="hm-pnl__row">
            <div className="hm-pnl__when">
              <b>{r.starts.slice(0, 10)}</b>
              <span>{r.setting === "sea" ? "AFLOAT" : "ASHORE"}</span>
            </div>
            <div className="hm-pnl__what">
              <div className="hm-pnl__t">{r.title}</div>
              <div className="hm-pnl__m">
                <span>{price(r.revenueCents)} in</span>
                {r.costed ? (
                  <>
                    <span>·</span>
                    <span>{price(r.costCents)} out</span>
                    {r.unsettledCents > 0 ? (
                      <Badge tone="caution">{price(r.unsettledCents)} unsettled</Badge>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            <div className="hm-pnl__margin">
              {r.costed ? (
                <b className={r.marginCents < 0 ? "hm-pnl__neg" : undefined}>
                  {price(r.marginCents)}
                </b>
              ) : (
                /* Not a zero and not a dash. The words, because the reader
                   needs to know this is missing rather than small. */
                <span className="hm-pnl__uncosted">not costed</span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(r)}>
              Costs
            </Button>
          </div>
        ))}
      </div>

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        width={520}
        eyebrow={open ? `${price(open.revenueCents)} in` : ""}
        title={open?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              Done
            </Button>
            <Button variant="gold" size="sm" disabled={pending || !amount} onClick={save}>
              Record it
            </Button>
          </>
        }
      >
        {open ? (
          <div className="hm-form">
            {mine.length > 0 ? (
              <div className="hm-pnl__lines">
                {mine.map((e) => (
                  <div key={e.id} className="hm-pnl__line">
                    <span className="hm-mono">{e.kindLabel}</span>
                    <span>{e.note || "—"}</span>
                    <span className="hm-mono">{price(e.amountCents)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => settleExpense(e.id, !e.settled), e.settled ? "Marked an estimate." : "Marked settled.")
                      }
                    >
                      {e.settled ? "Settled" : "Estimate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => removeExpense(e.id), "Line removed.")}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hm-note">Nothing recorded against this night yet.</p>
            )}

            <Select
              label="What"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={kinds.map((k) => ({ value: k.slug, label: k.label }))}
            />
            <Input
              label="Amount"
              placeholder="1250.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="Note — optional"
              placeholder="Two hulls, Saturday rate"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              variant={settled ? "outline" : "ghost"}
              size="sm"
              onClick={() => setSettled((s) => !s)}
            >
              {settled ? "Settled invoice" : "Estimate — not settled"}
            </Button>
          </div>
        ) : null}
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
