"use client";

import React from "react";
import { GALLEY_QUEUE_KEY } from "@/lib/device-storage";
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

const QUEUE_KEY = GALLEY_QUEUE_KEY;

/* `key` is minted once, when the order is first attempted, and travels with it
   through every retry — that is the whole point. Minting it at send time would
   produce a new key per attempt and dedupe nothing. */
type QueuedOrder = { episodeId: string; lines: GalleyLine[]; key: string };

function mintKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/* Every change to the queue re-reads it first. Writing a snapshot taken before
   an await erases anything ordered during the flush — the same bug the gangway
   had, in the same shape, one screen along. */
function mutateQueue(fn: (q: QueuedOrder[]) => QueuedOrder[]): QueuedOrder[] {
  const next = fn(readQueue());
  writeQueue(next);
  return next;
}

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
  episodeId,
  items,
}: {
  episodeId: string;
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
  const flushing = React.useRef(false);
  const flush = React.useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    let sent = 0;
    try {
      const startingKeys = readQueue().map((o) => o.key);
      for (const key of startingKeys) {
        const order = readQueue().find((o) => o.key === key);
        if (!order) continue;
        try {
          const res = await placeGalleyOrder(order.episodeId, order.lines, order.key);
          if (res.error) {
            /* Dropped, but SAID. This used to `continue` silently on any error,
               so a member's order could vanish between the boat and the galley
               with nothing on screen — and the comment called it "stale". */
            setError(res.error);
          } else {
            sent += 1;
          }
          setQueued(mutateQueue((q) => q.filter((o) => o.key !== key)).length > 0);
        } catch {
          /* Still no signal. The order stays, and because it carries the same
             key, sending it again cannot charge twice even if the first attempt
             actually landed. */
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
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
    if (lines.length === 0 || pending) return;
    /* Minted before the attempt, so the queued copy and the attempt that may
       already have landed are the same order. */
    const key = mintKey();
    setPending(true);
    setError(null);
    try {
      const res = await placeGalleyOrder(episodeId, lines, key);
      if (res.error) {
        setError(res.error);
      } else {
        setQty({});
        setToast("Order placed — the galley has it. Charged to your account.");
        router.refresh();
      }
    } catch {
      /* Offline or the request never landed — queue it for later. */
      mutateQueue((q) => [...q, { episodeId, lines, key }]);
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
                    max={12}
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
