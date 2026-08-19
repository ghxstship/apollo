import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { CONTEST_METRIC, knots, LOGBOOK } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { getMember } from "../data";

export const metadata: Metadata = { title: LOGBOOK.regattas };

/* Regattas and challenges — the club's contests, all of them bounded. A regatta
   ranks its entrants; a challenge measures them against a target. Both close on
   a date and become history, which is the point: no standing outlives its
   window, so nobody is permanently mid-table. */

export default async function RegattasPage() {
  const { supabase, user } = await getMember();

  const [contestsRes, entriesRes] = await Promise.all([
    supabase
      .from("contests")
      .select("*")
      .in("status", ["open", "settled"])
      .order("ends_at", { ascending: false }),
    supabase.from("contest_entries").select("*").eq("profile_id", user.id),
  ]);

  const entered = new Set((entriesRes.data ?? []).map((e) => e.contest_id));
  const all = contestsRes.data ?? [];
  const now = new Date().getTime();
  const running = all.filter((c) => c.status === "open");
  const past = all.filter((c) => c.status === "settled");

  return (
    <div className="ls-fade">
      <span className="mbr-eyebrow">{LOGBOOK.regattas}</span>
      <h1 className="mbr-h1">Bounded, and then over.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "58ch" }}>
        A regatta ranks the boats that entered it. A challenge asks for a number
        and you either reach it or you don&rsquo;t. Both close on a date — the
        result is published once and joins the log.
      </p>

      <section className="mbr-sec">
        <span className="mbr-eyebrow">Running now</span>
        {running.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Nothing open. The next one is called from the Bridge.
          </p>
        ) : (
          <div className="rgt-list">
            {running.map((c) => {
              const closes = new Date(c.ends_at).getTime();
              const days = Math.max(0, Math.ceil((closes - now) / 86_400_000));
              return (
                <Link key={c.id} href={`/regattas/${c.slug}`} className="rgt-row">
                  <div>
                    <h3>{c.title}</h3>
                    {c.blurb ? <p>{c.blurb}</p> : null}
                    <div className="rgt-meta">
                      <Badge tone="outline">
                        {c.shape === "regatta" ? "Regatta" : "Challenge"}
                      </Badge>
                      <Badge tone="outline">
                        {c.shape === "challenge" && c.target
                          ? `${c.target} ${CONTEST_METRIC[c.metric] ?? c.metric}`
                          : (CONTEST_METRIC[c.metric] ?? c.metric)}
                      </Badge>
                      {c.knots_award > 0 ? (
                        <Badge tone="outline">{knots(c.knots_award)}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="rgt-aside">
                    {entered.has(c.id) ? <Badge tone="laurel">Entered</Badge> : null}
                    <span className="mbr-mono">
                      {days === 0 ? "CLOSES TODAY" : `${days} DAY${days === 1 ? "" : "S"} LEFT`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Settled</span>
          <div className="rgt-list">
            {past.map((c) => (
              <Link key={c.id} href={`/regattas/${c.slug}`} className="rgt-row">
                <div>
                  <h3>{c.title}</h3>
                  {c.blurb ? <p>{c.blurb}</p> : null}
                </div>
                <div className="rgt-aside">
                  <span className="mbr-mono">
                    {c.settled_at ? logDate(c.settled_at) : logDate(c.ends_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
