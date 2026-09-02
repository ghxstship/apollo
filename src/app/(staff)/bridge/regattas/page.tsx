import type { Metadata } from "next";
import { LOGBOOK } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { getOperator } from "../../data";
import { RegattasClient, type ContestRow } from "./regattas-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: LOGBOOK.regattas };

export default async function RegattasPage() {
  const { supabase } = await getOperator();

  const [contestsRes, entriesRes, episodesRes] = await Promise.all([
    supabase.from("contests").select("*").order("ends_at", { ascending: false }),
    supabase.from("contest_entries").select("contest_id"),
    /* The crew-scope picker. A crew contest runs within one episode's crew, so
       only episodes that could still hold one are offered — completed and
       cancelled episodes have no crew to enter it. */
    supabase
      .from("episodes")
      .select("id, title, starts_at, time_zone")
      .in("status", ["scheduled", "live"])
      .order("starts_at", { ascending: true }),
  ]);

  const counts = new Map<string, number>();
  for (const e of must(entriesRes)) {
    counts.set(e.contest_id, (counts.get(e.contest_id) ?? 0) + 1);
  }

  const rows: ContestRow[] = (must(contestsRes)).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    shape: c.shape,
    metric: c.metric,
    target: c.target,
    knotsAward: c.knots_award,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    status: c.status,
    entries: counts.get(c.id) ?? 0,
  }));

  return (
    <div>
      <span className="hm-eyebrow">{LOGBOOK.regattas}</span>
      <h1 className="hm-h1">Contests, and their endings.</h1>
      <p className="hm-lede">
        A regatta ranks the members who entered it; a challenge asks for a number.
        Both run inside a window and both get settled — the standing freezes, the
        award posts, and the result becomes history. The club keeps no all-time table.
      </p>
      <RegattasClient
        rows={rows}
        episodes={must(episodesRes).map((v) => ({
          value: v.id,
          label: `${v.title} · ${logDate(v.starts_at, v.time_zone)}`,
        }))}
      />
    </div>
  );
}
