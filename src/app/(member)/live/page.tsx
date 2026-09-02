import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Badge, StateBlock } from "@/components/ds";
import { SURFACES } from "@/lib/brand";
import { logDateTime, logTime, price } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { DECK_FLAGS, DECK_STATES, type DeckState } from "@/lib/show";
import type { Json } from "@/lib/supabase/types";
import { getMember, type Episode } from "../data";
import { readLegs, readStops, type EpisodeLeg, type EpisodeStop } from "../itinerary/data";
import { Countdown } from "./countdown";
import { FrameUpload } from "./frame-upload";
import { YourFrames, type OwnFrame } from "./your-frames";
import { GalleyOrderForm, type GalleyItem } from "./galley";

export const metadata: Metadata = { title: SURFACES.gateway };

/* — the standard sea-day legs, offsets in minutes from cast-off. The LAST
   resort: the crew's posted legs come first, the episode's itinerary jsonb
   second, and this only when both are silent — a member should never read a
   stock schedule while the crew has posted a real one. — */
const LEGS = [
  { offset: -30, title: "Boards", detail: "Muster at the gangway. Waivers clear, coffee below deck." },
  { offset: 0, title: "Underway", detail: "Open water. Watch two on deck; helm open to first-timers." },
  { offset: 240, title: "Swim stop", detail: "If the water agrees. Ladder aft, buddy up." },
  { offset: 600, title: "Golden hour", detail: "The long light home. Back before it goes." },
] as const;

/* One line of the member timeline, whichever source it came from. */
type Leg = {
  key: string;
  /* Epoch ms when the leg is timed; null for a day-numbered charter leg. */
  at: number | null;
  timeLabel: string | null;
  title: string;
  detail: string | null;
  /* The kit's hold copy in its order — reason, new plan, what is unchanged. */
  hold: string | null;
  /* Port-guide facts, printed in the data register. */
  stops: string[];
};

/* Postgres `time` comes out as "11:00:00"; the seconds are noise here. */
const hm = (t: string) => t.slice(0, 5);

function stopLine(s: EpisodeStop): string {
  return [
    s.name,
    s.tender_at ? `tender ${hm(s.tender_at)}` : null,
    s.last_return ? `last return ${hm(s.last_return)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function legsFromRows(legs: EpisodeLeg[], stops: EpisodeStop[], tz: string | null): Leg[] {
  const out: Leg[] = legs.map((leg) => ({
    key: leg.id,
    at: leg.starts_at ? Date.parse(leg.starts_at) : null,
    timeLabel: leg.starts_at ? logTime(leg.starts_at, tz) : `Day ${leg.day}`,
    title: leg.place,
    detail: leg.note,
    /* The constraint guarantees all three fields on a held leg; the guard is
       only for a cached row from before it existed. */
    hold:
      leg.status === "held" && leg.hold_reason && leg.hold_new_plan && leg.hold_unchanged
        ? `Held — ${leg.hold_reason} · ${leg.hold_new_plan} · Unchanged: ${leg.hold_unchanged}`
        : null,
    stops: stops.filter((s) => s.leg_id === leg.id).map(stopLine),
  }));
  /* A stop filed under no leg still belongs on the page. */
  const loose = stops.filter((s) => !s.leg_id).map(stopLine);
  if (loose.length) {
    out.push({
      key: "ports-of-call",
      at: null,
      timeLabel: null,
      title: "Ports of call",
      detail: null,
      hold: null,
      stops: loose,
    });
  }
  return out;
}

/* The guest-facing itinerary jsonb — [{ offset, title, note }], offsets in
   minutes from cast-off, as the Episodes tab writes it. Anything that does not
   parse is skipped rather than invented. */
function legsFromItinerary(itinerary: Json | null, startMs: number, tz: string | null): Leg[] {
  if (!Array.isArray(itinerary)) return [];
  const out: Leg[] = [];
  itinerary.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const rec = item as { [key: string]: Json | undefined };
    const offset = typeof rec.offset === "number" ? rec.offset : null;
    const title = typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : null;
    if (offset === null || !title) return;
    const note =
      typeof rec.note === "string" ? rec.note : typeof rec.detail === "string" ? rec.detail : null;
    const at = startMs + offset * 60000;
    out.push({
      key: `itinerary-${i}`,
      at,
      timeLabel: logTime(new Date(at).toISOString(), tz),
      title,
      detail: note,
      hold: null,
      stops: [],
    });
  });
  return out;
}

/* The deck-state signal flag, member-sized. Geometry carries the meaning,
   never a division hue (src/lib/show.ts); stand_by is the one sanctioned
   caution override, because the amber is doing the work of the word. */
function DeckStateStrip({ state }: { state: DeckState }) {
  const flag = DECK_FLAGS[state];
  const ink = flag.inverse ? "var(--ivory-100)" : "var(--noir-900)";
  const mark: CSSProperties =
    flag.mark === "square"
      ? { position: "absolute", inset: 0, margin: "auto", width: 10, height: 10, background: ink }
      : flag.mark === "band"
        ? { position: "absolute", left: 0, right: 0, top: 9, height: 6, background: ink }
        : flag.mark === "triangle"
          ? {
              position: "absolute",
              left: "50%",
              top: 6,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: `11px solid ${ink}`,
            }
          : { position: "absolute", left: -10, top: -3, width: 56, height: 12, transform: "rotate(-32deg)", background: ink };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--line-faint)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          flex: "none",
          width: 34,
          height: 24,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
          background: flag.caution
            ? "var(--caution)"
            : flag.inverse
              ? "var(--noir-900)"
              : "var(--surface-raised)",
        }}
      >
        <span style={mark} />
      </span>
      <b style={{ font: "700 10px var(--font-mono)", letterSpacing: "var(--track-data)" }}>{flag.label}</b>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)" }}>{flag.says}</span>
    </div>
  );
}

/* Read a live condition off the episode's conditions jsonb — never fake it. */
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

const ORDER_BADGE: Record<string, { tone: "gold" | "positive" | "caution" | "outline"; label: string }> = {
  placed: { tone: "outline", label: "Placed" },
  ready: { tone: "gold", label: "Ready" },
  delivered: { tone: "positive", label: "Delivered" },
  cancelled: { tone: "caution", label: "Cancelled" },
};

export default async function LivePage() {
  const { supabase, user } = await getMember();
  const nowIso = new Date().toISOString();

  const [liveRes, nextRes] = await Promise.all([
    supabase
      .from("episodes")
      .select("*")
      .eq("status", "live")
      .order("starts_at", { ascending: true })
      .limit(1),
    supabase
      .from("episodes")
      .select("*")
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1),
  ]);

  const live: Episode | null = liveRes.data?.[0] ?? null;
  const next: Episode | null = nextRes.data?.[0] ?? null;

  if (!live) {
    return (
      <div className="ls-fade">
        <span className="mbr-eyebrow">Underway</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Live.
        </h1>
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Navigation"
            title="Nothing underway."
            detail={
              next
                ? `Next departure: ${next.title} · ${logDateTime(next.starts_at, next.time_zone)}.`
                : "The season holds the next departure."
            }
            action={
              next ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <Countdown target={next.starts_at} />
                  <Link href="/passes" className="ls-btn ls-btn--outline ls-btn--sm">
                    Passes
                  </Link>
                </div>
              ) : (
                <Link href="/passes" className="ls-btn ls-btn--outline ls-btn--sm">
                  Passes
                </Link>
              )
            }
          />
        </div>
      </div>
    );
  }

  /* Am I aboard? The galley only serves the crew on the water. Alongside it:
     the episode's posted legs, its stops, and the deck state.

     RLS reality, read before writing this (supabase/migrations/20260825065942):
     episode_legs and episode_stops carry `for select … using (true)` for both
     anon and authenticated — a member reads them directly. episodes.deck_state
     (20260825070340) rides the public episodes select policy; its column
     comment says guests are meant to read it. Nothing here needs a definer or
     a wider policy. moduleTables() only because the shared type file predates
     these tables and this column — see src/lib/module-tables.ts. */
  const db = moduleTables(supabase);
  const [{ data: myPass }, legRows, stopRows, deckRes] = await Promise.all([
    supabase
      .from("passes")
      .select("id,status")
      .eq("episode_id", live.id)
      .eq("profile_id", user.id)
      .eq("status", "aboard")
      .maybeSingle(),
    readLegs(supabase, live.id),
    readStops(supabase, live.id),
    db.from("episodes").select("deck_state").eq("id", live.id).maybeSingle(),
  ]);
  const aboard = !!myPass;

  /* The member's own frames on this episode. Read through RLS — the policy
     "members see approved, own, and staff see all" means this returns their
     own whether cleared or not, which is the point: a frame still with the
     Bridge is exactly the one somebody is most likely to want back. */
  const ownFramesRes = aboard
    ? await supabase
        .from("episode_media")
        .select("id, caption, approved")
        .eq("episode_id", live.id)
        .eq("uploaded_by", user.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const ownFrames: OwnFrame[] = (ownFramesRes.data ?? []).map((f) => ({
    id: f.id,
    caption: f.caption,
    approved: f.approved,
  }));

  /* Validated against the model rather than cast blind — the check constraint
     guarantees the four values, but a constraint is not a compiler. */
  const deckRaw = (deckRes.data as { deck_state?: string | null } | null)?.deck_state ?? null;
  const deckState: DeckState | null =
    deckRaw && (DECK_STATES as readonly string[]).includes(deckRaw) ? (deckRaw as DeckState) : null;

  /* Galley shelf + my orders for this episode. */
  const [itemsRes, ordersRes] = aboard
    ? await Promise.all([
        supabase.from("galley_items").select("*").eq("active", true).order("name"),
        supabase
          .from("galley_orders")
          .select("*")
          .eq("profile_id", user.id)
          .eq("episode_id", live.id)
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

  /* The crew's posted legs first, the itinerary jsonb second, the standard
     sea-day fallback only when both are empty. */
  const postedLegs = legsFromRows(legRows, stopRows, live.time_zone);
  const itineraryLegs = postedLegs.length
    ? []
    : legsFromItinerary(live.itinerary, startMs, live.time_zone);
  const legs: Leg[] = postedLegs.length
    ? postedLegs
    : itineraryLegs.length
      ? itineraryLegs
      : LEGS.map((l, i) => {
          const at = startMs + l.offset * 60000;
          return {
            key: `standard-${i}`,
            at,
            timeLabel: logTime(new Date(at).toISOString(), live.time_zone),
            title: l.title,
            detail: l.detail,
            hold: null,
            stops: [],
          };
        });
  /* The current leg is the last timed one already begun; untimed legs take no
     state of their own. */
  const currentIdx = legs.reduce((acc, l, i) => (l.at !== null && l.at <= nowMs ? i : acc), -1);

  /* Live conditions off the episode record — "—" when the log is silent. */
  const cond = live.conditions;
  const wind = condition(cond, ["wind"]);
  const swell = condition(cond, ["swell"]);
  const heading = condition(cond, ["heading", "hdg"]);
  const speed = condition(cond, ["speed", "kn", "knots"]);

  return (
    <div className="ls-fade">
      <div className="now-hero mbr-bleed">
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
        {/* The hero h1 was the log line, so the underway state of this page
            never carried its own name while the empty state did. The name is
            the h1 in both states now; the log line reads under it, which is
            where a status belongs. */}
        <h1>Live.</h1>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-on-media)",
            marginTop: 8,
          }}
        >
          Rail down, all well.
        </p>
        <div className="now-cond">
          <span>WIND {wind ?? "—"}</span>
          <span>SWELL {swell ?? "—"}</span>
          <span>HDG {heading ?? "—"}</span>
          <span>SPEED {speed ?? "—"}</span>
          {live.coordinates ? <span>{live.coordinates}</span> : null}
        </div>
      </div>
      <div className="now-seam mbr-bleed"></div>

      {deckState ? <DeckStateStrip state={deckState} /> : null}

      <div className="now-tl ls-rise">
        {legs.map((leg, i) => (
          <div key={leg.key} className={i < currentIdx ? "done" : i === currentIdx ? "here" : undefined}>
            <span className="t">{leg.timeLabel ?? "—"}</span>
            <span className="dot"><i></i></span>
            <div>
              <b className={i === currentIdx ? "ls-live" : undefined}>{leg.title}</b>
              {leg.detail ? <p>{leg.detail}</p> : null}
              {leg.hold ? <p style={{ color: "var(--caution)" }}>{leg.hold}</p> : null}
              {leg.stops.map((s) => (
                <p
                  key={s}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "var(--track-data)",
                  }}
                >
                  {s.toUpperCase()}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {aboard && galleyItems.length > 0 ? (
        <div className="now-panel ls-rise-1">
          <h3>The galley</h3>
          <GalleyOrderForm episodeId={live.id} items={galleyItems} />
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
                        <span>{logTime(o.created_at, live.time_zone)} · {price(o.total_cents)}</span>
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

      {aboard ? (
        <div className="now-panel ls-rise-1">
          <h3>A frame for the log</h3>
          <p className="mbr-mono" style={{ marginBottom: 10 }}>
            FROM THE WATER · CLEARED BY THE BRIDGE BEFORE THE GALLERY
          </p>
          <FrameUpload episodeId={live.id} />
          {/* What you sent, and the way to take it back. A member could upload
              from the day the feature shipped and never see one afterwards —
              the only listing was the Bridge's. */}
          <YourFrames frames={ownFrames} />
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
