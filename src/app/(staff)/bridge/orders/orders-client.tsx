"use client";

import { LEDGER_KIND } from "@/lib/brand";
import React from "react";
import { Badge, Button, Dialog, Input, Select, Table, Tag, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { postLedgerEntry, refundShopOrder, refundToCard } from "./actions";

export type LedgerRow = {
  id: string;
  member: string;
  memberNo: string;
  kind: string;
  memo: string;
  amount: string;
  deltaCents: number;
  created: string;
  /* The Stripe object behind a card settlement, when there is one. It is what
     a refund to the card is issued against. */
  stripeRef: string | null;
  [key: string]: unknown;
};

export type ShopOrderRow = {
  id: string;
  shortId: string;
  member: string;
  total: string;
  /* What lands on the member account if this is approved — the gross minus the
     discount. The house credit ceiling is measured against it. */
  refundCents: number;
  status: "placed" | "fulfilled" | "refund_requested" | "refunded";
  created: string;
  [key: string]: unknown;
};

export type MemberOption = { value: string; label: string };

const ORDER_TONE: Record<ShopOrderRow["status"], "gold" | "ink" | "positive" | "caution" | "outline"> = {
  placed: "outline",
  fulfilled: "positive",
  refund_requested: "caution",
  refunded: "ink",
};

const ORDER_LABEL: Record<ShopOrderRow["status"], string> = {
  placed: "Placed",
  fulfilled: "Fulfilled",
  refund_requested: "Refund requested",
  refunded: "Refunded",
};

type Filter = "all" | "charges" | "payments";
type PostKind = "payment" | "refund";

/* "$165.00" from a cents figure, for the one sentence that names the ceiling.
   price() lives on the server side of this screen; this is the whole of what
   the dialog needs. */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OrdersClient({
  entries,
  shopOrders,
  members,
  operators,
  houseCreditMaxCents,
}: {
  entries: LedgerRow[];
  shopOrders: ShopOrderRow[];
  members: MemberOption[];
  /* Everyone on the Bridge but the operator reading this screen. */
  operators: MemberOption[];
  /* club_setting('house_credit_max_cents'), or null when it could not be read.
     A refund above it needs a second operator named on the row. */
  houseCreditMaxCents: number | null;
}) {
  const [pending, startTransition] = React.useTransition();
  /* A hand-typed entry that matches one posted minutes ago. Neither an error
     nor a success — a question for a person. */
  const [repeat, setRepeat] = React.useState<{
    kind: "payment" | "refund";
    cents: number;
    why: string;
    /* Carried through, so an entry confirmed on the second ask reaches the
       ledger with the same second operator on it as the first. */
    seconded: string | null;
  } | null>(null);
  const { toast, toastOpen, show, clear } = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [posting, setPosting] = React.useState<PostKind | null>(null);
  const [form, setForm] = React.useState({ profileId: "", amount: "", memo: "", seconded: "" });
  const [refund, setRefund] = React.useState<ShopOrderRow | null>(null);
  /* The colleague seconding a Shop refund that clears the ceiling. */
  const [refundSeconded, setRefundSeconded] = React.useState("");
  /* A card refund — the settlement row being reversed, and the form. */
  const [toCard, setToCard] = React.useState<LedgerRow | null>(null);
  const [cardForm, setCardForm] = React.useState({ amount: "", reason: "" });

  const run = (fn: () => Promise<{ error?: string }>, ok: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) show({ msg: res.error, tone: "danger" });
      else ok();
    });
  };

  const visible = entries.filter((e) =>
    filter === "all" ? true : filter === "charges" ? e.deltaCents < 0 : e.deltaCents > 0
  );

  /* A hand-typed refund carries no Stripe object, so it is a house credit —
     money the club gives back with nothing behind it — and above the ceiling it
     takes two people. The amount is read live, so the second Select appears the
     moment the figure clears the line. */
  const postedCents = Math.round(Number(form.amount) * 100);
  const needsASecond =
    posting === "refund" &&
    houseCreditMaxCents !== null &&
    Number.isFinite(postedCents) &&
    postedCents > houseCreditMaxCents;

  const refundNeedsASecond =
    !!refund && houseCreditMaxCents !== null && refund.refundCents > houseCreditMaxCents;

  /* `again` carries what the first attempt was, because the second attempt is
     made from the repeat dialog — by which point the posting dialog has been
     closed and this component has re-rendered without it. Reading `posting`
     there would read null and the entry would go up with no kind at all. */
  const submitPost = (
    evenIfItLooksLikeARepeat = false,
    again?: { kind: PostKind; seconded: string | null }
  ) => {
    const kind = again?.kind ?? posting!;
    const cents = Math.round(Number(form.amount) * 100);
    const seconded =
      again !== undefined ? again.seconded : kind === "refund" && needsASecond ? form.seconded : null;
    setPosting(null);
    startTransition(async () => {
      /* Not folded into run(): a suspected repeat is neither a failure nor a
         success, and reporting it as either is how a member gets refunded
         twice or an operator gives up on a refund that was never posted. */
      const res = await postLedgerEntry(
        form.profileId,
        kind,
        cents,
        form.memo,
        evenIfItLooksLikeARepeat,
        seconded
      );
      if (res.looksLikeARepeat) {
        setRepeat({ kind, cents, why: res.looksLikeARepeat, seconded });
        return;
      }
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      setForm({ profileId: "", amount: "", memo: "", seconded: "" });
      show({
        msg: kind === "payment" ? "Payment posted." : "Refund posted.",
        meta: "SHIP'S RECORD · YOUR NAME ON IT",
        tone: "positive",
      });
    });
  };


  return (
    <>
      <div className="hm-head hm-tabbody">
        <div className="ls-acts">
          {(
            [
              ["all", "All"],
              ["charges", "Charges"],
              ["payments", "Payments"],
            ] as Array<[Filter, string]>
          ).map(([id, label]) => (
            <Tag key={id} active={filter === id} onClick={() => setFilter(id)}>
              {label}
            </Tag>
          ))}
        </div>
        <div className="ls-acts">
          <Button variant="outline" size="sm" onClick={() => setPosting("payment")}>
            Post payment
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPosting("refund")}>
            Post refund
          </Button>
        </div>
      </div>

      <div className="hm-panel">
        <Table
          rowKey={(e: LedgerRow) => e.id}
          columns={[
            {
              key: "member",
              label: "Member",
              render: (e: LedgerRow) => (
                <span className="hm-who">
                  <b>{e.member}</b>
                  <span className="hm-mono">
                    {e.memberNo}
                  </span>
                </span>
              ),
            },
            {
              key: "kind",
              label: "Kind",
              render: (e: LedgerRow) => (
                <Badge tone={e.deltaCents < 0 ? "outline" : "positive"}>{LEDGER_KIND[e.kind] ?? e.kind}</Badge>
              ),
            },
            { key: "memo", label: "Memo", render: (e: LedgerRow) => e.memo || "—" },
            { key: "amount", label: "Amount", numeric: true, width: 100 },
            { key: "created", label: "Posted", mono: true, width: 110 },
            {
              key: "act",
              label: "",
              render: (e: LedgerRow) =>
                e.kind === "payment" && e.stripeRef ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setToCard(e);
                      setCardForm({ amount: (e.deltaCents / 100).toFixed(2), reason: "" });
                    }}
                  >
                    Refund to card
                  </Button>
                ) : null,
            },
          ]}
          rows={visible}
        />
        {visible.length === 0 ? (
          <p className="ls-empty">
            Nothing in the record under that filter.
          </p>
        ) : null}
      </div>

      <section className="hm-sec">
        <h2>Shop orders.</h2>
        <p className="hm-note">Refund requests wait here — approval credits the member account and emails the receipt.</p>
        <div className="hm-panel">
          <Table
            rowKey={(o: ShopOrderRow) => o.id}
            columns={[
              { key: "shortId", label: "Order", mono: true, width: 100 },
              { key: "member", label: "Member" },
              { key: "total", label: "Total", mono: true, width: 90 },
              {
                key: "status",
                label: "Status",
                render: (o: ShopOrderRow) => <Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge>,
              },
              { key: "created", label: "Placed", mono: true, width: 110 },
              {
                key: "act",
                label: "",
                render: (o: ShopOrderRow) =>
                  o.status === "refund_requested" ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => setRefund(o)}>
                      Review
                    </Button>
                  ) : null,
              },
            ]}
            rows={shopOrders}
          />
          {shopOrders.length === 0 ? (
            <p className="ls-empty">
              No Shop orders on the books.
            </p>
          ) : null}
        </div>
      </section>

      <Dialog
        open={!!posting}
        onClose={() => setPosting(null)}
        width={400}
        eyebrow="Account activity"
        title={posting === "refund" ? "Post a refund." : "Post a payment."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPosting(null)}>
              Not yet
            </Button>
            <Button
              variant="outline"
              disabled={
                !form.profileId ||
                !(Number(form.amount) > 0) ||
                (needsASecond && !form.seconded)
              }
              pending={pending}
              pendingLabel="Posting…"
              onClick={() => submitPost()}
            >
              Post it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            Financial actions log to the ship&apos;s record with your name on them.
          </p>
          <Select
            label="Member"
            placeholder="Pick a member"
            options={members}
            value={form.profileId}
            onChange={(e) => setForm((f) => ({ ...f, profileId: e.target.value }))}
          />
          <Input
            label="Amount ($)"
            type="number"
            min={0.01}
            step="0.01"
            placeholder="85.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Input
            label="Memo"
            placeholder={posting === "refund" ? "Pass released in time" : "Squared at Shoreside"}
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
          />
          {needsASecond ? (
            <>
              <p className="hm-body">
                A credit above {dollars(houseCreditMaxCents ?? 0)} is more than one operator
                gives on their own. Name the colleague who agreed it — their name goes on the
                row beside yours and stays there.
              </p>
              <Select
                label="Seconded by"
                placeholder="Pick an operator"
                options={operators}
                value={form.seconded}
                onChange={(e) => setForm((f) => ({ ...f, seconded: e.target.value }))}
              />
              {operators.length === 0 ? (
                <p className="hm-body hm-body--muted">
                  Nobody else is on the Bridge to second it. Shoreside can add an operator, or
                  post this as two credits inside the line.
                </p>
              ) : null}
            </>
          ) : null}
          {posting === "refund" && houseCreditMaxCents === null ? (
            <p className="hm-body hm-body--muted">
              The house credit ceiling could not be read, so no credit can be posted just now.
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={!!repeat}
        onClose={() => setRepeat(null)}
        width={430}
        eyebrow="Already on the record"
        title="This looks like one you just posted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRepeat(null)}>
              Leave it
            </Button>
            <Button
              variant="outline"
              pending={pending}
              pendingLabel="Posting…"
              onClick={() => {
                const again = repeat;
                setRepeat(null);
                if (!again) return;
                /* Same entry, posted deliberately this time — and told what it
                   was, rather than left to read a dialog that has closed. */
                submitPost(true, { kind: again.kind, seconded: again.seconded });
              }}
            >
              Post it anyway
            </Button>
          </>
        }
      >
        <p className="hm-body">{repeat?.why}</p>
        <p className="hm-body hm-body--muted">
          Two operators working the same request is how a member gets refunded
          twice out of the club&rsquo;s money. Nothing has been posted yet.
        </p>
      </Dialog>

      <Dialog
        open={!!refund}
        onClose={() => {
          setRefund(null);
          setRefundSeconded("");
        }}
        width={380}
        eyebrow={refund ? `${refund.shortId} · ${refund.member}` : ""}
        title={refund ? `Refund ${refund.total}?` : ""}
        footer={
          refund ? (
            <>
              <Button variant="ghost" onClick={() => setRefund(null)}>
                Not yet
              </Button>
              <Button
                variant="gold"
                disabled={refundNeedsASecond && !refundSeconded}
                pending={pending}
                pendingLabel="Refunding…"
                onClick={() => {
                  const o = refund;
                  const seconded = refundNeedsASecond ? refundSeconded : null;
                  setRefund(null);
                  setRefundSeconded("");
                  run(
                    () => refundShopOrder(o.id, seconded),
                    () =>
                      show({
                        msg: "Refund posted — email sent.",
                        meta: `${o.shortId} · ${o.total} TO MEMBER ACCOUNT`,
                        tone: "positive",
                      })
                  );
                }}
              >
                Approve refund
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            The refund posts to the member account and the receipt goes out by email.
            Financial actions log to the ship&apos;s record with your name on them.
          </p>
          {/* Credit to the account with no Stripe object behind it is a house
              credit whatever raised it, so a Shop refund meets the same ceiling
              a hand-typed one does — asked here rather than refused after the
              order has already been flipped to refunded. */}
          {refundNeedsASecond ? (
            <>
              <p className="hm-body">
                This is above {dollars(houseCreditMaxCents ?? 0)}, so it takes a second
                operator. Name the colleague who agreed it.
              </p>
              <Select
                label="Seconded by"
                placeholder="Pick an operator"
                options={operators}
                value={refundSeconded}
                onChange={(e) => setRefundSeconded(e.target.value)}
              />
            </>
          ) : null}
        </div>
      </Dialog>

      {/* The money leaves Stripe here. Nothing is posted from this dialog: the
          webhook records the refund on charge.refunded, keyed on Stripe's own
          refund id, so the book cannot claim a refund Stripe declined and a
          redelivered event cannot double it. */}
      <Dialog
        open={!!toCard}
        onClose={() => setToCard(null)}
        width={420}
        eyebrow={toCard ? `${toCard.member} · ${toCard.created}` : ""}
        title={toCard ? `Refund ${toCard.amount} to the card?` : ""}
        footer={
          toCard ? (
            <>
              <Button variant="ghost" onClick={() => setToCard(null)}>
                Not yet
              </Button>
              <Button
                variant="danger"
                disabled={!(Number(cardForm.amount) > 0) || !cardForm.reason.trim()}
                pending={pending}
                pendingLabel="Refunding…"
                onClick={() => {
                  const row = toCard;
                  const cents = Math.round(Number(cardForm.amount) * 100);
                  setToCard(null);
                  run(
                    () => refundToCard(row.stripeRef ?? "", cents, cardForm.reason.trim()),
                    () =>
                      show({
                        msg: "Refund sent to Stripe — it posts here when the card is credited.",
                        meta: `${row.member} · $${(cents / 100).toFixed(2)} TO CARD`,
                        tone: "positive",
                      })
                  );
                }}
              >
                Refund to card
              </Button>
            </>
          ) : null
        }
      >
        <div className="hm-form">
          <p className="hm-body">
            This returns money to the card that paid, not to the member account. It
            cannot be taken back. The ledger row appears when Stripe confirms the
            credit, usually within a minute.
          </p>
          <Input
            label="Amount ($)"
            type="number"
            min={0.01}
            step="0.01"
            max={toCard ? (toCard.deltaCents / 100).toFixed(2) : undefined}
            value={cardForm.amount}
            onChange={(e) => setCardForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Input
            label="Reason"
            placeholder="Episode cancelled — weather"
            value={cardForm.reason}
            onChange={(e) => setCardForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
      </Dialog>

      {toast ? (
        <Toast fixed open={toastOpen} message={toast.msg} meta={toast.meta} tone={toast.tone} onClose={clear} />
      ) : null}
    </>
  );
}
