"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, StateBlock, Stepper, Toast } from "@/components/ds";
import { price } from "@/lib/format";
import { placeGalleyOrder, type GalleyLine } from "./actions";

export type GalleyItem = {
  id: string;
  category: "bar" | "galley" | "merch";
  name: string;
  price_cents: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  bar: "The bar",
  galley: "The galley",
  merch: "Merch",
};

const QUEUE_KEY = "syrius-galley-queue";

type QueuedOrder = { voyageId: string; lines: GalleyLine[] };

function readQueue(): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedOrder[]) {
  try {
    if (q.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* private mode */
  }
}

export function GalleyOrderForm({
  voyageId,
  items,
}: {
  voyageId: string;
  items: GalleyItem[];
}) {
  const router = useRouter();
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* Flush any queued orders on mount and whenever signal returns. */
  const flush = React.useCallback(async () => {
    const q = readQueue();
    if (q.length === 0) return;
    const remaining: QueuedOrder[] = [];
    let sent = 0;
    for (const order of q) {
      try {
        const res = await placeGalleyOrder(order.voyageId, order.lines);
        if (res.error) continue; // stale order — drop rather than retry forever
        sent += 1;
      } catch {
        remaining.push(order); // still no signal — keep it
      }
    }
    writeQueue(remaining);
    setQueued(remaining.length > 0);
    if (sent > 0) {
      setToast(sent === 1 ? "Queued order sent to the galley." : `${sent} queued orders sent to the galley.`);
      router.refresh();
    }
  }, [router]);

  React.useEffect(() => {
    /* Deferred so the first flush runs off the render/effect frame. */
    const t = setTimeout(() => void flush(), 0);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  const lines: GalleyLine[] = items
    .filter((i) => (qty[i.id] ?? 0) > 0)
    .map((i) => ({ itemId: i.id, qty: qty[i.id] }));
  const total = items.reduce((sum, i) => sum + i.price_cents * (qty[i.id] ?? 0), 0);

  const submit = async () => {
    if (lines.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await placeGalleyOrder(voyageId, lines);
      if (res.error) {
        setError(res.error);
      } else {
        setQty({});
        setToast("Order placed — the galley has it. Charged to your account.");
        router.refresh();
      }
    } catch {
      /* Offline or the request never landed — queue it for later. */
      writeQueue([...readQueue(), { voyageId, lines }]);
      setQty({});
      setQueued(true);
    } finally {
      setPending(false);
    }
  };

  const categories = (["bar", "galley", "merch"] as const).filter((c) =>
    items.some((i) => i.category === c)
  );

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat} style={{ marginTop: 14 }}>
          <span className="mbr-mono">{CATEGORY_LABEL[cat].toUpperCase()}</span>
          <div className="now-galley">
            {items
              .filter((i) => i.category === cat)
              .map((i) => (
                <div key={i.id} className="now-galley__item">
                  <div>
                    <b>{i.name}</b>
                    <span>{price(i.price_cents)}</span>
                  </div>
                  <Stepper
                    size="sm"
                    min={0}
                    max={20}
                    value={qty[i.id] ?? 0}
                    onChange={(n) => setQty((q) => ({ ...q, [i.id]: n }))}
                    incrementLabel={`Add ${i.name}`}
                    decrementLabel={`Remove ${i.name}`}
                  />
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="now-galley__foot">
        <span className="mbr-mono">{total > 0 ? `TOTAL ${price(total)}` : "NOTHING YET"}</span>
        <Button
          variant="gold"
          size="sm"
          disabled={pending || lines.length === 0}
          onClick={submit}
        >
          Charge my account
        </Button>
      </div>
      {error ? (
        <span className="voy-hold" role="alert" style={{ display: "block", marginTop: 8 }}>
          {error}
        </span>
      ) : null}

      {queued ? (
        <div style={{ marginTop: 14 }}>
          <StateBlock
            status="offline"
            bare
            title="Order queued."
            detail="No signal past the breakwater — order queued, sends when you're back."
          />
        </div>
      ) : null}

      {toast ? <Toast fixed message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
