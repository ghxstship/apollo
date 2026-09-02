import type { Metadata } from "next";
import Link from "next/link";
import { Badge, StateBlock } from "@/components/ds";
import { CONTEST_METRIC, knots, LOGBOOK } from "@/lib/brand";
import { logDate } from "@/lib/format";
import { getMember } from "../data";

export const metadata: Metadata = { title: LOGBOOK.regattas };

/* Regattas and challenges — the club's contests, all of them bounded. A regatta
   ranks its entrants; a challenge measures them against a target. Both close on
   a date and become history, which is the point: no standing outlives its
   window, so nobody is permanently mid-table.

   One idiom, not two. .rgt-list is a seam container — 1px gap over a faint
   ground inside a single border — built so flush children read as one ruled
   block. It was filled with the kit's ContestCard, which brings its own border,
   --radius-md and --shadow-card: between any two of them that made card border
   + seam + card border, a 3px grey stripe with rounded corners floating inside
   a square container. The list is hairline rows now, which is what the design
   system asks for; the card lives on in the kit for surfaces that want one. */

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
      {/* Name in the h1, editorial line in the eyebrow — see the note on
          Account. The nav reads this same LOGBOOK word, so the heading takes
          it and the standing line moves up. */}
      <span className="mbr-eyebrow">Bounded, and then over</span>
      <h1 className="mbr-h1">{LOGBOOK.regattas}.</h1>
      <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "58ch" }}>
        A regatta ranks the boats that entered it. A challenge asks for a number
        and you either reach it or you don&rsquo;t. Both close on a date — the
        result is published once and joins the log.
      </p>

      <section className="mbr-sec">
        <span className="mbr-eyebrow">Running now</span>
        {running.length === 0 ? (
          <StateBlock
            status="empty"
            icon="Flag"
            title="Nothing open."
            detail="The next one is called from the Bridge."
          />
        ) : (
          <div className="rgt-list">
            {running.map((c) => {
              const closes = new Date(c.ends_at).getTime();
              const days = Math.max(0, Math.ceil((closes - now) / 86_400_000));
              return (
                <Link key={c.id} href={`/regattas/${c.slug}`} className="rgt-row">
                  <div>
                    <span className="mbr-eyebrow">
                      {c.shape === "challenge" ? "CHALLENGE" : "REGATTA"}
                    </span>
                    <h3>{c.title}</h3>
                    {c.blurb ? <p>{c.blurb}</p> : null}
                    <div className="rgt-meta">
                      <Badge tone="outline">
                        {c.shape === "challenge" && c.target
                          ? `${c.target} ${CONTEST_METRIC[c.metric] ?? c.metric}`
                          : (CONTEST_METRIC[c.metric] ?? c.metric)}
                      </Badge>
                      {c.knots_award > 0 ? <Badge tone="gold">{knots(c.knots_award)}</Badge> : null}
                    </div>
                  </div>
                  <div className="rgt-aside">
                    <span className="mbr-mono">{days} DAYS LEFT</span>
                    {entered.has(c.id) ? <Badge tone="positive">ENTERED</Badge> : null}
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
                  <span className="mbr-mono">
                    {c.shape === "challenge" ? "CHALLENGE" : "REGATTA"} ·{" "}
                    {c.settled_at ? logDate(c.settled_at, zone) : logDate(c.ends_at, zone)}
                  </span>
                  <h3>{c.title}</h3>
                  {c.blurb ? <p>{c.blurb}</p> : null}
                </div>
                <div className="rgt-aside">
                  <span className="mbr-mono">SETTLED</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
