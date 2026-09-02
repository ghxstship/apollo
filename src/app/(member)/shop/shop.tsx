"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Icon, Select, Stepper, Tag, Toast } from "@/components/ds";
import { logDate, price } from "@/lib/format";
import { SURFACES } from "@/lib/brand";
import { useModal } from "@/components/ds/use-modal";
import { placeShopOrder, requestRefund, type CrateLine } from "./actions";

export type ShopProduct = {
  id: string;
  name: string;
  category: "deck" | "galley" | "wardrobe";
  price_cents: number;
  sizes: string[];
  badge: string | null;
};

export type ShopOrderView = {
  id: string;
  created_at: string;
  total_cents: number;
  discount_cents: number;
  status: "placed" | "fulfilled" | "refund_requested" | "refunded";
  summary: string;
};

const CATEGORIES = [
  { id: "deck", label: "Deck" },
  { id: "galley", label: "Galley" },
  { id: "wardrobe", label: "Wardrobe" },
] as const;

const CATEGORY_SEA: Record<string, string> = {
  deck: "var(--sea-dawn)",
  galley: "var(--sea-day)",
  wardrobe: "var(--sea-dusk)",
};

const ORDER_BADGE: Record<string, { tone: "gold" | "ink" | "positive" | "caution" | "outline"; label: string }> = {
  placed: { tone: "outline", label: "Placed" },
  fulfilled: { tone: "positive", label: "Fulfilled" },
  refund_requested: { tone: "caution", label: "Refund requested" },
  refunded: { tone: "ink", label: "Refunded" },
};

type CartLine = CrateLine & { name: string; priceCents: number };

export function Shop({
  zone,
  products,
  isGlobal,
  orders,
}: {
  /* A client component renders once on the server and again in the browser.
     Without an explicit clock those two runs used different zones and the date
     changed between first paint and hydration, with a React text mismatch
     behind it. */
  zone: string | null;
  products: ShopProduct[];
  isGlobal: boolean;
  orders: ShopOrderView[];
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<ShopProduct | null>(null);
  const [size, setSize] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [drawer, setDrawer] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  /* The crate is behind a full veil, so it is a modal in every way except the
     four things it owed the keyboard. */
  const drawerRef = useModal(drawer, () => setDrawer(false));

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = filter ? products.filter((p) => p.category === filter) : products;

  const openProduct = (p: ShopProduct) => {
    setOpen(p);
    setSize("");
    setQty(1);
    setError(null);
  };

  const addToCrate = () => {
    if (!open) return;
    if (open.sizes.length > 0 && !size) {
      setError("Pick a size first.");
      return;
    }
    const line: CartLine = {
      productId: open.id,
      qty,
      size: open.sizes.length > 0 ? size : null,
      name: open.name,
      priceCents: open.price_cents,
    };
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === line.productId && l.size === line.size);
      if (i === -1) return [...c, line];
      const next = [...c];
      next[i] = { ...next[i], qty: Math.min(20, next[i].qty + line.qty) };
      return next;
    });
    setOpen(null);
    setDrawer(true);
  };

  const setLineQty = (idx: number, n: number) => {
    setCart((c) =>
      n <= 0 ? c.filter((_, i) => i !== idx) : c.map((l, i) => (i === idx ? { ...l, qty: n } : l))
    );
  };

  const subtotal = cart.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
  const discount = isGlobal ? Math.round(subtotal * 0.15) : 0;
  const total = subtotal - discount;

  /* Minted once per crate and re-sent unchanged on every retry — the server's
     idempotency machinery only works if the client actually sends the key it
     was built for. Cleared when the crate changes (a different crate is a
     different order) and on success. */
  const idemRef = React.useRef<string | null>(null);
  const mintIdem = () => (idemRef.current ??= crypto.randomUUID());
  /* A different crate is a different order. A failed retry keeps the key
     (cart untouched), an edit mints fresh. */
  React.useEffect(() => {
    idemRef.current = null;
  }, [cart]);

  const checkout = async () => {
    setPending(true);
    setError(null);
    const res = await placeShopOrder(
      cart.map(({ productId, qty: q, size: s }) => ({ productId, qty: q, size: s })),
      mintIdem()
    );
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    idemRef.current = null;
    setCart([]);
    setDrawer(false);
    setToast("Charged to your account — collect at the harbor or the next shore night.");
    router.refresh();
  };

  const refund = async (orderId: string) => {
    const res = await requestRefund(orderId);
    if (res.error) {
      /* The server writes these refusals to be read — "already with the
         Bridge", "past the point where it can be sent back". Dropping them
         made the button look dead. */
      setToast(res.error);
      return;
    }
    setToast("Refund requested — the Bridge reviews it.");
    router.refresh();
  };

  return (
    <div>
      <div className="chd-bar">
        <div className="wd-filter" role="group" aria-label="Categories">
          <Tag active={filter === null} onClick={() => setFilter(null)}>
            All
          </Tag>
          {CATEGORIES.map((c) => (
            <Tag
              key={c.id}
              active={filter === c.id}
              onClick={() => setFilter(filter === c.id ? null : c.id)}
            >
              {c.label}
            </Tag>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setDrawer(true)}>
          <Icon name="ShoppingBasket" size={14} style={{ marginRight: 7 }} />
          The crate{cart.length ? ` · ${cart.reduce((n, l) => n + l.qty, 0)}` : ""}
        </Button>
      </div>

      <div className="chd-grid">
        {shown.map((p) => (
          <button key={p.id} type="button" className="chd-tile" onClick={() => openProduct(p)}>
            <span className="chd-tile__media" style={{ background: CATEGORY_SEA[p.category] }}>
              {p.badge ? <Badge tone="gold">{p.badge}</Badge> : null}
            </span>
            <span className="chd-tile__body">
              <b>{p.name}</b>
              <span>{price(p.price_cents)}</span>
            </span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 16 }}>
          Nothing on this shelf yet.
        </p>
      ) : null}

      {/* — product dialog — */}
      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        width={420}
        eyebrow={SURFACES.shop}
        title={open?.name}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              Leave it
            </Button>
            <Button variant="gold" size="sm" onClick={addToCrate}>
              Add to the crate
            </Button>
          </>
        }
      >
        {open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span className="mbr-mono">{price(open.price_cents)}</span>
            {open.sizes.length > 0 ? (
              <Select
                label="Size"
                placeholder="Pick a size"
                options={open.sizes.map((s) => ({ value: s, label: s }))}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                error={error}
              />
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="mbr-mono">QTY</span>
              <Stepper size="sm" min={1} max={12} value={qty} onChange={setQty} />
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* — crate drawer — */}
      {drawer ? (
        <div className="chd-veil" onClick={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <aside className="chd-drawer" role="dialog" aria-modal="true" aria-label="The crate" ref={drawerRef} tabIndex={-1}>
            <div className="chd-drawer__head">
              <b>The crate</b>
              <button type="button" className="wd-x" aria-label="Close the crate" onClick={() => setDrawer(false)}>
                ✕
              </button>
            </div>
            <div className="chd-drawer__body">
              {cart.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>Empty. The shelves are right there.</p>
              ) : (
                cart.map((l, i) => (
                  <div key={l.productId + (l.size ?? "")} className="chd-line">
                    <div>
                      <b>{l.name}</b>
                      <span>
                        {l.size ? `${l.size} · ` : ""}
                        {price(l.priceCents)}
                      </span>
                    </div>
                    <Stepper size="sm" min={0} max={12} value={l.qty} onChange={(n) => setLineQty(i, n)} />
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 ? (
              <div className="chd-drawer__foot">
                <div className="chd-sum">
                  <span>Subtotal</span>
                  <span className="mbr-mono">{price(subtotal)}</span>
                </div>
                {discount > 0 ? (
                  <div className="chd-sum chd-sum--brass">
                    <span>Global member discount</span>
                    <span className="mbr-mono">−{price(discount)}</span>
                  </div>
                ) : null}
                <div className="chd-sum chd-sum--total">
                  <span>Total</span>
                  <span className="mbr-mono">{price(total)}</span>
                </div>
                {error ? (
                  <span className="voy-hold" role="alert">
                    {error}
                  </span>
                ) : null}
                <Button variant="gold" fullWidth disabled={pending} onClick={checkout}>
                  Charge to member account
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* — order history — */}
      {orders.length > 0 ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Past orders</span>
          <div>
            {orders.map((o) => {
              const b = ORDER_BADGE[o.status] ?? ORDER_BADGE.placed;
              return (
                <div key={o.id} className="chd-order">
                  <div>
                    <b>{o.summary || "Order"}</b>
                    <span>
                      {logDate(o.created_at, zone)} · {price(o.total_cents)}
                      {o.discount_cents > 0 ? ` · GLOBAL −${price(o.discount_cents)}` : ""}
                    </span>
                  </div>
                  <Badge tone={b.tone}>{b.label}</Badge>
                  {o.status === "placed" || o.status === "fulfilled" ? (
                    <Button variant="ghost" size="sm" onClick={() => refund(o.id)}>
                      Request refund
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {toast ? <Toast fixed message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
