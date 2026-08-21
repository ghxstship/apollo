"use client";

import React from "react";
import { Avatar, Button, Dialog, Input, Stepper, Tabs, Toast } from "@/components/ds";
import { price } from "@/lib/format";
import { useToast } from "../../ui";
import { lookupMember, settleTicket, type TicketLine } from "./actions";

export type PosItem = {
  id: string;
  category: "bar" | "galley" | "merch";
  name: string;
  priceCents: number;
};

type Line = { item: PosItem; qty: number };
type Member = { id: string; name: string; memberNo: string; tier: string };
type Tender = "account" | "till";

const CATS = [
  { id: "bar", label: "Bar" },
  { id: "galley", label: "Galley" },
  { id: "merch", label: "Merch" },
];

const TIER_LABEL: Record<string, string> = {
  regional: "Regional",
  national: "National",
  global: "Global",
};

export function PosClient({ items }: { items: PosItem[] }) {
  const [pending, startTransition] = React.useTransition();
  const { toast, show, clear } = useToast();
  const [cat, setCat] = React.useState("bar");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [lookup, setLookup] = React.useState("");
  const [member, setMember] = React.useState<Member | null>(null);
  const [tender, setTender] = React.useState<Tender | null>(null);

  const add = (item: PosItem) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item.id === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { item, qty: 1 }];
    });

  const setQty = (itemId: string, qty: number) =>
    setLines((ls) =>
      qty === 0 ? ls.filter((l) => l.item.id !== itemId) : ls.map((l) => (l.item.id === itemId ? { ...l, qty } : l))
    );

  const total = lines.reduce((t, l) => t + l.item.priceCents * l.qty, 0);
  const itemCount = lines.reduce((t, l) => t + l.qty, 0);

  const attach = () => {
    const code = lookup.trim();
    if (!code) return;
    startTransition(async () => {
      const res = await lookupMember(code);
      if (res.error || !res.member) {
        show({ msg: res.error ?? "No member under that number.", meta: "CHECK THE CARD", tone: "danger" });
      } else {
        setMember(res.member);
        show({
          msg: `${res.member.name} attached.`,
          meta: `${res.member.memberNo} · ${(TIER_LABEL[res.member.tier] ?? res.member.tier).toUpperCase()}`,
        });
      }
      setLookup("");
    });
  };

  const settle = (how: Tender) => {
    const m = member!;
    const ticket: TicketLine[] = lines.map((l) => ({
      itemId: l.item.id,
      qty: l.qty,
      priceCents: l.item.priceCents,
    }));
    const settledTotal = total;
    const settledCount = itemCount;
    setTender(null);
    startTransition(async () => {
      const res = await settleTicket(m.id, ticket, how);
      if (res.error) show({ msg: res.error, tone: "danger" });
      else {
        show({
          msg: `Settled — ${how === "account" ? "member account" : "at the till"}.`,
          meta: `${price(settledTotal)} · ${settledCount} ITEMS · ${m.memberNo}`,
          tone: "positive",
        });
        setLines([]);
        setMember(null);
      }
    });
  };

  const inCat = items.filter((i) => i.category === cat);

  return (
    <>
      <div className="hm-pos">
        <div>
          <Tabs items={CATS} value={cat} onChange={setCat} />
          <div className="hm-pos__grid">
            {inCat.map((item) => (
              <button type="button" key={item.id} className="hm-pos__item" onClick={() => add(item)}>
                <b>{item.name}</b>
                <span>{price(item.priceCents)}</span>
              </button>
            ))}
            {inCat.length === 0 ? (
              <p style={{ color: "var(--text-3)", fontSize: 13 }}>Nothing on this shelf.</p>
            ) : null}
          </div>
        </div>

        <aside className="hm-ticket">
          <div className="hm-ticket__head">
            {member ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={member.name} tone="gold" size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{member.name}</div>
                  <span className="hm-mono">
                    {member.memberNo} · {(TIER_LABEL[member.tier] ?? member.tier).toUpperCase()}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setMember(null)}>
                  Detach
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <Input
                  label="Member"
                  placeholder="SYR-0214"
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") attach();
                  }}
                  style={{ flex: 1 }}
                />
                <Button variant="outline" disabled={pending} onClick={attach}>
                  Attach
                </Button>
              </div>
            )}
          </div>

          <div className="hm-ticket__lines">
            {lines.length === 0 ? (
              <p style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 12.5 }}>
                Ring the first item — tap the catalog.
              </p>
            ) : (
              lines.map((l) => (
                <div className="hm-ticket__line" key={l.item.id}>
                  <span>{l.item.name}</span>
                  <Stepper size="sm" min={0} max={20} value={l.qty} onChange={(q) => setQty(l.item.id, q)} />
                  <span className="num">{price(l.item.priceCents * l.qty)}</span>
                </div>
              ))
            )}
          </div>

          <div className="hm-ticket__tot">
            <div>
              <span>ITEMS</span>
              <span>{itemCount}</span>
            </div>
            <div className="grand">
              <span>TOTAL</span>
              <span>{total ? price(total) : "$0"}</span>
            </div>
          </div>

          <div className="hm-ticket__tender">
            <Button
              variant="gold"
              disabled={pending || !lines.length || !member}
              onClick={() => setTender("account")}
            >
              To member account
            </Button>
            <Button
              variant="outline"
              disabled={pending || !lines.length || !member}
              onClick={() => setTender("till")}
            >
              Card / cash
            </Button>
          </div>
          {!member && lines.length ? (
            <p className="hm-note" style={{ padding: "0 16px 14px", marginTop: 0 }}>
              Attach a member to settle — every ticket lands on a record.
            </p>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={!!tender}
        onClose={() => setTender(null)}
        width={380}
        eyebrow={tender === "account" ? "Tender · member account" : "Tender · card or cash"}
        title={total ? price(total) : "$0"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTender(null)}>
              Back
            </Button>
            <Button variant="gold" disabled={pending} onClick={() => settle(tender!)}>
              Settle
            </Button>
          </>
        }
      >
        {tender === "account"
          ? `${member?.name ?? ""} — the charge posts to the member account. Financial actions log to the ship's record with your name on them.`
          : "Recorded only — the till already took it. The ledger nets to zero, memo reads 'Paid at the till'."}
      </Dialog>

      {toast ? (
        <Toast fixed message={toast.msg} meta={toast.meta} tone={toast.tone} onDismiss={clear} />
      ) : null}
    </>
  );
}
