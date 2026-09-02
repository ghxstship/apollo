import type { Metadata } from "next";
import { logDate, logTime } from "@/lib/format";
import { radarPhase, type RadarClock } from "@/lib/radar";
import { moduleTables } from "@/lib/module-tables";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { RadarClient, type RadarOpsRow } from "./radar-client";

export const metadata: Metadata = { title: "Radar" };

interface AnchorRow {
  episode_id: string;
}

export default async function RadarOpsPage() {
  const { supabase } = await getOperator();
  const db = moduleTables(supabase);

  /* The board: everything still ahead, plus the last fortnight behind — a
     guarantee settles when an episode is marked completed, and the crew need to
     see that it did. */
  const behind = new Date(new Date().getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const episodesRes = await supabase
    .from("episodes")
    .select("id, title, starts_at, time_zone, status")
    .gte("starts_at", behind)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  const episodes = must(episodesRes);
  const ids = episodes.map((v) => v.id);

  const [clocksRes, aboardRes, anchorsRes] = await Promise.all([
    ids.length ? db.from("episode_radar").select("*").in("episode_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("passes").select("episode_id, status").in("episode_id", ids).eq("status", "aboard")
      : Promise.resolve({ data: [], error: null }),
    /* shared_anchors is readable by staff — the same policy that lets the crew
       cut one short. radar_picks is NOT: its only read policy is "your own
       picks and no one else's", and staff are deliberately not exempt. So this
       screen counts anchors and never picks, and says so rather than rendering
       a zero it cannot stand behind. */
    ids.length ? db.from("shared_anchors").select("episode_id").in("episode_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);

  const clocks = new Map(
    (must(clocksRes as { data: RadarClock[] | null; error: null })).map((c) => [c.episode_id, c])
  );

  const aboardCount = new Map<string, number>();
  for (const r of must(aboardRes)) {
    aboardCount.set(r.episode_id, (aboardCount.get(r.episode_id) ?? 0) + 1);
  }

  const anchorCount = new Map<string, number>();
  for (const a of must(anchorsRes as { data: AnchorRow[] | null; error: null })) {
    anchorCount.set(a.episode_id, (anchorCount.get(a.episode_id) ?? 0) + 1);
  }

  /* Request time, read once so every row on the page agrees about which phase
     the clock is in. */
  const now = new Date().getTime();

  const rows: RadarOpsRow[] = episodes.map((v) => {
    const clock = clocks.get(v.id) ?? null;
    const zone = v.time_zone;
    return {
      id: v.id,
      title: v.title,
      departs: `${logDate(v.starts_at, zone)} · ${logTime(v.starts_at, zone)}`,
      status: v.status,
      aboard: aboardCount.get(v.id) ?? 0,
      opens: clock ? logTime(clock.opens_at, zone) : null,
      locks: clock ? logTime(clock.locks_at, zone) : null,
      unlocks: clock ? logTime(clock.anchors_unlock_at, zone) : null,
      expires: clock ? `${logDate(clock.anchors_expire_at, zone)} ${logTime(clock.anchors_expire_at, zone)}` : null,
      slots: clock?.slots ?? null,
      phase: clock ? radarPhase(clock, now) : "unopened",
      settled: !!clock?.settled_at,
      anchors: anchorCount.get(v.id) ?? 0,
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Radar</span>
      <h1 className="hm-h1">The sweep.</h1>
      <p className="hm-lede">
        Radar runs on an episode or it does not run at all. Opening it sets four
        times off that episode&apos;s own departure and its city&apos;s clock:
        the sweep opens at 17:15, picks close at 17:30, the Captain&apos;s Log
        opens at 19:00, and the contacts are gone twenty-four hours later.
      </p>
      <p className="hm-note">
        Until an episode carries a clock, /radar reads Dark to everybody aboard,
        no pick can be plotted, no anchor can be made, and the Match Guarantee
        has nothing to settle against. Anchors are counted here; picks are not,
        because a member&apos;s picks are theirs and the crew have never been
        able to read them.
      </p>
      <RadarClient rows={rows} />
    </div>
  );
}
