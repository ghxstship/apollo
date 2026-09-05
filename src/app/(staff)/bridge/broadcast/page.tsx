import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { BroadcastClient, type SentRow } from "./broadcast-client";
import { describeAudience, type Lookups } from "./audience";

export const metadata: Metadata = { title: "Broadcast" };

/* The one way to tell members something that is not a pre-registered
   trigger. Until 2026-09-04 a venue change or a season on sale was an
   engineer's job. */
export default async function BroadcastPage() {
  const { supabase } = await getOperator();
  const nowIso = new Date().toISOString();
  const [citiesRes, episodesRes, sentRes, plansRes, leaguesRes] = await Promise.all([
    supabase.from("cities").select("id, name").order("position"),
    supabase
      .from("episodes")
      .select("id, title, starts_at")
      .gte("starts_at", nowIso)
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at")
      .limit(60),
    supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("membership_plans").select("id, label").eq("active", true).order("price_cents"),
    supabase.from("leagues").select("league, name").order("league"),
  ]);
  const lookups: Lookups = {
    cities: must(citiesRes).map((c) => ({ value: c.id, label: c.name })),
    episodes: must(episodesRes).map((e) => ({ value: e.id, label: `${e.title} — ${logDateTime(e.starts_at, CLUB_ZONE)}` })),
    plans: must(plansRes).map((p) => ({ value: p.id, label: p.label })),
    leagues: must(leaguesRes).map((l) => ({ value: String(l.league), label: l.name })),
  };

  const sent: SentRow[] = must(sentRes).map((b) => ({
    id: b.id,
    title: b.title,
    audience: describeAudience(b.audience as Record<string, unknown>, lookups),
    channels: b.channels.map((c) => (c === "sms" ? "text" : c)).join(" + "),
    recipients: b.recipients,
    when: logDateTime(b.created_at, CLUB_ZONE),
    status: b.status,
    /* The hour it went, or is to go. Null on a word said at once before the
       column existed. */
    sendAt: b.send_at ? logDateTime(b.send_at, CLUB_ZONE) : null,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Broadcast</span>
      <h1 className="hm-h1">A word to everyone it concerns.</h1>
      <p className="hm-lede">
        Pick who, say it once — now, or at an hour you name. A notice lands in the
        app and, if you choose, by email, push or text. Every send is kept below
        with who it reached, so nobody wonders whether the venue change went out.
      </p>
      <BroadcastClient lookups={lookups} sent={sent} />
    </div>
  );
}
