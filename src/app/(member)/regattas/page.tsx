import type { Metadata } from "next";
import Link from "next/link";
import { ContestCard } from "@/components/ds";
import { CONTEST_METRIC, knots, LOGBOOK } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { getMember } from "../data";

export const metadata: Metadata = { title: LOGBOOK.regattas };

/* Regattas and challenges — the club's contests, all of them bounded. A regatta
   ranks its entrants; a challenge measures them against a target. Both close on
   a date and become history, which is the point: no standing outlives its
   window, so nobody is permanently mid-table. */

export default async function RegattasPage() {
  const { supabase, user, zone } = await getMember();

  /* The fifty most recently closing contests — open ones are few and close
     soonest-last, so they always sit inside the window; settled ones roll
     off the bottom into history, which is where the page says they go. */
  const [contestsRes, entriesRes] = await Promise.all([
    supabase
      .from("contests")
      .select("id,slug,title,shape,metric,target,knots_award,blurb,status,ends_at,settled_at")
      .in("status", ["open", "settled"])
      .order("ends_at", { ascending: false })
      .limit(50),
    supabase.from("contest_entries").select("contest_id").eq("profile_id", user.id),
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
                <Link key={c.id} href={`/regattas/${c.slug}`} className="mbr-plain">
                  <ContestCard
                    shape={c.shape === "challenge" ? "challenge" : "regatta"}
                    name={c.title}
                    metric={
                      c.shape === "challenge" && c.target
                        ? `${c.target} ${CONTEST_METRIC[c.metric] ?? c.metric}`
                        : (CONTEST_METRIC[c.metric] ?? c.metric)
                    }
                    award={c.knots_award > 0 ? knots(c.knots_award) : undefined}
                    entered={entered.has(c.id)}
                    daysLeft={days}
                  >
                    {c.blurb ? (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>{c.blurb}</p>
                    ) : null}
                  </ContestCard>
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
              <Link key={c.id} href={`/regattas/${c.slug}`} className="mbr-plain">
                <ContestCard
                  shape={c.shape === "challenge" ? "challenge" : "regatta"}
                  name={c.title}
                  window={c.settled_at ? logDate(c.settled_at, zone) : logDate(c.ends_at, zone)}
                  settled
                >
                  {c.blurb ? (
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>{c.blurb}</p>
                  ) : null}
                </ContestCard>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
