import type { Metadata } from "next";
import Link from "next/link";
import { Badge, StateBlock } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { logDateTime, logTime, price } from "@/lib/format";
import type { Json } from "@/lib/supabase/types";
import { getMember, type Voyage } from "../data";
import { Countdown } from "./countdown";
import { GalleyOrderForm, type GalleyItem } from "./galley";

export const metadata: Metadata = { title: SURFACES.gateway };

/* — the standard sea-day legs, offsets in minutes from cast-off — */
const LEGS = [
  { offset: -30, title: "Boards", detail: "Muster at the gangway. Waivers clear, coffee below deck." },
  { offset: 0, title: "Underway", detail: "Open water. Watch two on deck; helm open to first-timers." },
  { offset: 240, title: "Swim stop", detail: "If the water agrees. Ladder aft, buddy up." },
  { offset: 600, title: "Golden hour", detail: "The long light home. Back before it goes." },
] as const;

/* Read a live condition off the voyage's conditions jsonb — never fake it. */
function condition(conditions: Json | null, keys: string[]): string | null {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return null;
  const rec = conditions as { [key: string]: Json | undefined };
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim().toUpperCase();
    if (typeof v === "number") return String(v);
  }
  return null;
}

const ORDER_BADGE: Record<string, { tone: "brass" | "laurel" | "clay" | "outline"; label: string }> = {
  placed: { tone: "outline", label: "Placed" },
  ready: { tone: "brass", label: "Ready" },
  delivered: { tone: "laurel", label: "Delivered" },
  cancelled: { tone: "clay", label: "Cancelled" },
};

export default async function GatewayPage() {
  const { supabase, user } = await getMember();
  const nowIso = new Date().toISOString();

  const [liveRes, nextRes] = await Promise.all([
    supabase
      .from("voyages")
      .select("*")
      .eq("status", "live")
      .order("starts_at", { ascending: true })
      .limit(1),
    supabase
      .from("voyages")
      .select("*")
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1),
  ]);

  const live: Voyage | null = liveRes.data?.[0] ?? null;
  const next: Voyage | null = nextRes.data?.[0] ?? null;

  if (!live) {
    return (
      <div className="ls-fade">
        <span className="mbr-eyebrow">Underway</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Gateway.
        </h1>
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Navigation"
            title="Nothing underway."
            detail={
              next
                ? `Next departure: ${next.title} · ${logDateTime(next.starts_at)}.`
                : "The manifest holds the next departure."
            }
            action={
              next ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <Countdown target={next.starts_at} />
                  <Link href="/manifest" className="ls-btn ls-btn--outline ls-btn--sm">
                    View the manifest
                  </Link>
                </div>
              ) : (
                <Link href="/manifest" className="ls-btn ls-btn--outline ls-btn--sm">
                  View the manifest
                </Link>
              )
            }
          />
        </div>
      </div>
    );
  }

  /* Am I aboard? The galley only serves the crew on the water. */
  const { data: myRsvp } = await supabase
    .from("rsvps")
    .select("id,status")
    .eq("voyage_id", live.id)
    .eq("profile_id", user.id)
    .eq("status", "aboard")
    .maybeSingle();
  const aboard = !!myRsvp;

  /* Galley shelf + my orders for this voyage. */
  const [itemsRes, ordersRes] = aboard
    ? await Promise.all([
        supabase.from("galley_items").select("*").eq("active", true).order("name"),
        supabase
          .from("galley_orders")
          .select("*")
          .eq("profile_id", user.id)
          .eq("voyage_id", live.id)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  const galleyItems: GalleyItem[] = (itemsRes.data ?? []).map((i) => ({
    id: i.id,
    category: i.category,
    name: i.name,
    price_cents: i.price_cents,
  }));
  const myOrders = ordersRes.data ?? [];

  const orderIds = myOrders.map((o) => o.id);
  const { data: orderItems } = orderIds.length
    ? await supabase.from("galley_order_items").select("*").in("order_id", orderIds)
    : { data: [] };
  const itemName = new Map(galleyItems.map((i) => [i.id, i.name]));
  const summaryOf = (orderId: string) =>
    (orderItems ?? [])
      .filter((oi) => oi.order_id === orderId)
      .map((oi) => `${oi.qty}× ${itemName.get(oi.item_id) ?? "Item"}`)
      .join(" · ");

  /* Leg states derived from the clock — done, current, or ahead. */
  const nowMs = Date.parse(nowIso);
  const startMs = Date.parse(live.starts_at);
  const legTimes = LEGS.map((l) => startMs + l.offset * 60000);
  const currentIdx = legTimes.reduce((acc, t, i) => (t <= nowMs ? i : acc), -1);

  /* Live conditions off the voyage record — "—" when the log is silent. */
  const cond = live.conditions;
  const wind = condition(cond, ["wind"]);
  const swell = condition(cond, ["swell"]);
  const heading = condition(cond, ["heading", "hdg"]);
  const speed = condition(cond, ["speed", "kn", "knots"]);

  return (
    <div className="ls-fade">
      <div className="now-hero">
        <span
          className="ls-live"
          style={{
            font: "600 9px var(--font-sans)",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--neon-cyan)",
          }}
        >
          Underway · {live.title}
        </span>
        <h1>Rail down, all well.</h1>
        <div className="now-cond">
          <span>WIND {wind ?? "—"}</span>
          <span>SWELL {swell ?? "—"}</span>
          <span>HDG {heading ?? "—"}</span>
          <span>SPEED {speed ?? "—"}</span>
          {live.coordinates ? <span>{live.coordinates}</span> : null}
        </div>
      </div>
      <div className="now-seam"></div>

      <div className="now-tl ls-rise">
        {LEGS.map((leg, i) => (
          <div key={leg.title} className={i < currentIdx ? "done" : i === currentIdx ? "here" : undefined}>
            <span className="t">{logTime(new Date(legTimes[i]).toISOString())}</span>
            <span className="dot"><i></i></span>
            <div>
              <b className={i === currentIdx ? "ls-live" : undefined}>{leg.title}</b>
              <p>{leg.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {aboard && galleyItems.length > 0 ? (
        <div className="now-panel ls-rise-1">
          <h3>The galley</h3>
          <GalleyOrderForm voyageId={live.id} items={galleyItems} />
          {myOrders.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <span className="mbr-mono">MY ORDERS</span>
              <div className="now-orders">
                {myOrders.map((o) => {
                  const b = ORDER_BADGE[o.status] ?? ORDER_BADGE.placed;
                  return (
                    <div key={o.id} className="now-orders__row">
                      <div>
                        <b>{summaryOf(o.id) || "Order"}</b>
                        <span>{logTime(o.created_at)} · {price(o.total_cents)}</span>
                      </div>
                      <Badge tone={b.tone}>{b.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="now-panel ls-rise-2">
        <h3>Find your way</h3>
        <div className="now-way">
          <div>
            <b>The head</b>
            <span>BELOW, FORWARD, MIND THE STEP</span>
          </div>
          <div>
            <b>Life vests</b>
            <span>COCKPIT LOCKER, STARBOARD</span>
          </div>
          <div>
            <b>Dry bags</b>
            <span>UNDER THE NAV TABLE</span>
          </div>
          <div>
            <b>The skipper</b>
            <span>AT THE HELM · JUST ASK</span>
          </div>
        </div>
      </div>
    </div>
  );
}
