"use client";

import { LEDGER_KIND } from "@/lib/brand";
import React from "react";
import { Badge, Button, Dialog, Input, Select, Table, Tag, Toast } from "@/components/ds";
import { useToast } from "../../ui";
import { postLedgerEntry, refundShopOrder } from "./actions";

export type LedgerRow = {
  id: string;
  member: string;
  memberNo: string;
  kind: string;
  memo: string;
  amount: string;
  deltaCents: number;
  created: string;
  [key: string]: unknown;
};

export type ShopOrderRow = {
  id: string;
  shortId: string;
  member: string;
  total: string;
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

export function OrdersClient({
  entries,
  shopOrders,
  members,
}: {
  entries: LedgerRow[];
  shopOrders: ShopOrderRow[];
  members: MemberOption[];
}) {
  const [pending, startTransition] = React.useTransition();
  /* A hand-typed entry that matches one posted minutes ago. Neither an error
     nor a success — a question for a person. */
  const [repeat, setRepeat] = React.useState<{ kind: "payment" | "refund"; cents: number; why: string } | null>(null);
  const { toast, show, clear } = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [posting, setPosting] = React.useState<PostKind | null>(null);
  const [form, setForm] = React.useState({ profileId: "", amount: "", memo: "" });
  const [refund, setRefund] = React.useState<ShopOrderRow | null>(null);

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

  const submitPost = (evenIfItLooksLikeARepeat = false) => {
    const kind = posting!;
    const cents = Math.round(Number(form.amount) * 100);
    setPosting(null);
    startTransition(async () => {
      /* Not folded into run(): a suspected repeat is neither a failure nor a
         success, and reporting it as either is how a member gets refunded
         twice or an operator gives up on a refund that was never posted. */
      const res = await postLedgerEntry(form.profileId, kind, cents, form.memo, evenIfItLooksLikeARepeat);
      if (res.looksLikeARepeat) {
        setRepeat({ kind, cents, why: res.looksLikeARepeat });
        return;
      }
      if (res.error) {
        show({ msg: res.error, tone: "danger" });
        return;
      }
      setForm({ profileId: "", amount: "", memo: "" });
      show({
        msg: kind === "payment" ? "Payment posted." : "Refund posted.",
        meta: "SHIP'S RECORD · YOUR NAME ON IT",
        tone: "positive",
      });
    });
  };


  return (
    <>
      <div className="hm-head" style={{ marginTop: 20 }}>
        <div className="hm-acts">
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
        <div className="hm-acts">
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
                <span>
                  <b style={{ fontWeight: 700 }}>{e.member}</b>
                  <span className="hm-mono" style={{ display: "block", marginTop: 2 }}>
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
            { key: "amount", label: "Amount", mono: true, width: 100 },
            { key: "created", label: "Posted", mono: true, width: 110 },
          ]}
          rows={visible}
        />
        {visible.length === 0 ? (
          <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
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
            <p style={{ padding: "20px 4px", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>
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
              disabled={pending || !form.profileId || !(Number(form.amount) > 0)}
              onClick={() => submitPost()}
            >
              Post it
            </Button>
          </>
        }
      >
        <div className="hm-form">
          <p style={{ fontSize: "var(--text-sm)" }}>
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
              disabled={pending}
              onClick={() => {
                const again = repeat;
                setRepeat(null);
                if (!again) return;
                setPosting(again.kind);
                /* Same entry, posted deliberately this time. */
                queueMicrotask(() => submitPost(true));
              }}
            >
              Post it anyway
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "var(--text-sm)" }}>{repeat?.why}</p>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
          Two operators working the same request is how a member gets refunded
          twice out of the club&rsquo;s money. Nothing has been posted yet.
        </p>
      </Dialog>

      <Dialog
        open={!!refund}
        onClose={() => setRefund(null)}
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
                disabled={pending}
                onClick={() => {
                  const o = refund;
                  setRefund(null);
                  run(
                    () => refundShopOrder(o.id),
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
        The refund posts to the member account and the receipt goes out by email. Financial
        actions log to the ship&apos;s record with your name on them.
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
