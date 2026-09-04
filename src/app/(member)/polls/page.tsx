import type { Metadata } from "next";
import { Badge, Progress, StateBlock } from "@/components/ds";
import { logDateTime } from "@/lib/format";
import type { Json } from "@/lib/supabase/types";
import { getMember } from "../data";
import { Ballot } from "./ballot";

/* Route, title and h1: Polls. The eyebrow is the question the page asks. */
export const metadata: Metadata = { title: "Polls" };

/* options is a jsonb array of strings by constraint; anything else is skipped
   rather than rendered as "[object Object]". */
function optionsOf(raw: Json): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is string => typeof o === "string" && o.trim().length > 0);
}

export default async function PollsPage() {
  const { supabase, user, zone } = await getMember();
  /* Server-rendered per request, so "now" is request time. */
  const nowMs = new Date().getTime();

  const [{ data: pollRows }, { data: voteRows }] = await Promise.all([
    supabase.from("polls").select("*").order("closes_at", { ascending: false }).limit(60),
    supabase.from("poll_votes").select("poll_id, option").eq("profile_id", user.id),
  ]);
  const polls = pollRows ?? [];
  const mine = new Map((voteRows ?? []).map((v) => [v.poll_id, v.option]));

  const open = polls
    .filter((p) => Date.parse(p.closes_at) > nowMs)
    .sort((a, b) => Date.parse(a.closes_at) - Date.parse(b.closes_at));
  const closed = polls.filter((p) => Date.parse(p.closes_at) <= nowMs);

  /* Results are a definer that answers only once the question has closed.
     One call per closed question; the list is capped above. */
  const resultRows = await Promise.all(
    closed.map((p) => supabase.rpc("poll_results", { p_poll: p.id }))
  );
  const resultsById = new Map(
    closed.map((p, i) => [
      p.id,
      new Map((Array.isArray(resultRows[i].data) ? resultRows[i].data : []).map((r) => [r.option, Number(r.votes)])),
    ])
  );

  return (
    <div className="ls-fade" style={{ maxWidth: 720 }}>
      <span className="mbr-eyebrow">Questions on the table</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        Polls.
      </h1>
      <p className="pol-lede">
        The next Special&rsquo;s city, a regatta&rsquo;s route, what the galley stocks.
        One vote each, changeable until the question closes; the Bridge settles it
        like a contest. Never a question about a person — that is the Bridge&rsquo;s rule.
      </p>

      {polls.length === 0 ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Vote"
            title="Nothing on the table."
            detail="When the Bridge puts a question to the club, it lands here."
          />
        </div>
      ) : null}

      {open.length ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Open</span>
          {open.map((p, i) => {
            const options = optionsOf(p.options);
            return (
              <article key={p.id} className={"pol-card" + (i < 3 ? ` ls-rise-${i + 1}` : "")}>
                <h2 className="pol-q">{p.question}</h2>
                <div className="pol-meta">
                  <Badge tone="outline">Closes {logDateTime(p.closes_at, zone)}</Badge>
                </div>
                <Ballot pollId={p.id} options={options} mine={mine.get(p.id) ?? null} />
              </article>
            );
          })}
        </section>
      ) : null}

      {closed.length ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Closed</span>
          {closed.map((p) => {
            const options = optionsOf(p.options);
            const results = resultsById.get(p.id) ?? new Map<number, number>();
            const total = Array.from(results.values()).reduce((n, v) => n + v, 0);
            const myVote = mine.get(p.id) ?? null;
            return (
              <article key={p.id} className="pol-card">
                <h2 className="pol-q">{p.question}</h2>
                <div className="pol-meta">
                  <Badge tone="outline">Closed {logDateTime(p.closes_at, zone)}</Badge>
                  {p.settled !== null ? (
                    <Badge tone="gold">Settled</Badge>
                  ) : (
                    <Badge tone="outline">Awaiting the Bridge</Badge>
                  )}
                  <span className="mbr-mono">
                    {total} {total === 1 ? "VOTE" : "VOTES"}
                  </span>
                </div>
                <div className="pol-results">
                  {options.map((label, i) => {
                    const votes = results.get(i) ?? 0;
                    const pct = total ? Math.round((votes / total) * 100) : 0;
                    const settled = p.settled === i;
                    return (
                      <Progress
                        key={i}
                        value={pct}
                        tone={settled ? "positive" : undefined}
                        label={
                          <span className="pol-opt">
                            {label}
                            {settled ? <Badge tone="positive">The answer</Badge> : null}
                            {myVote === i ? <span className="mbr-mono">YOUR VOTE</span> : null}
                          </span>
                        }
                        detail={`${votes} · ${pct}%`}
                      />
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
