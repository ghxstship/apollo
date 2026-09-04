import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { BroadcastClient, type SentRow } from "./broadcast-client";

export const metadata: Metadata = { title: "Broadcast" };

/* The one way to tell members something that is not a pre-registered
   trigger. Until 2026-09-04 a venue change or a season on sale was an
   engineer's job. */
export default async function BroadcastPage() {
  const { supabase } = await getOperator();
  const nowIso = new Date().toISOString();
  const [citiesRes, episodesRes, sentRes] = await Promise.all([
    supabase.from("cities").select("id, name").order("position"),
    supabase
      .from("episodes")
      .select("id, title, starts_at")
      .gte("starts_at", nowIso)
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at")
      .limit(60),
    supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30),
  ]);

  const sent: SentRow[] = must(sentRes).map((b) => ({
    id: b.id,
    title: b.title,
    audience: describe(b.audience as Record<string, string>, must(citiesRes), must(episodesRes)),
    channels: b.channels.join(" + "),
    recipients: b.recipients,
    when: logDateTime(b.created_at, CLUB_ZONE),
  }));

  return (
    <div>
      <span className="hm-eyebrow">Broadcast</span>
      <h1 className="hm-h1">A word to everyone it concerns.</h1>
      <p className="hm-lede">
        Pick who, say it once. A notice lands in the app and, if you choose, in the
        post as a letter from the Bridge. Every send is kept below with who it
        reached, so nobody wonders whether the venue change went out.
      </p>
      <BroadcastClient
        cities={must(citiesRes).map((c) => ({ value: c.id, label: c.name }))}
        episodes={must(episodesRes).map((e) => ({
          value: e.id,
          label: `${e.title} — ${logDateTime(e.starts_at, CLUB_ZONE)}`,
        }))}
        sent={sent}
      />
    </div>
  );
}

function describe(
  a: Record<string, string>,
  cities: Array<{ id: string; name: string }>,
  episodes: Array<{ id: string; title: string }>
): string {
  switch (a.kind) {
    case "all":
      return "Every active member";
    case "lapsed":
      return "Members held for dues";
    case "tier":
      return `${a.tier} tier`;
    case "city":
      return cities.find((c) => c.id === a.id)?.name ?? "A city";
    case "episode":
      return episodes.find((e) => e.id === a.id)?.title ?? "An episode's manifest";
    default:
      return "—";
  }
}
