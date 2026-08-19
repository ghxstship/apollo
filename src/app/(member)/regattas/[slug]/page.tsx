import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Icon } from "@/components/ds";
import { CONTEST_METRIC, knots, LOGBOOK } from "@/lib/brand";
import { logDate, roman } from "@/lib/format";
import { getMember } from "../../data";
import { enterContest, withdrawFromContest } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { supabase } = await getMember();
  const { data } = await supabase
    .from("contests")
    .select("title")
    .eq("slug", slug)
    .maybeSingle();
  return { title: data?.title ?? LOGBOOK.regattas };
}

function score(metric: string, value: number): string {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return metric === "nm" ? `${n} NM` : n;
}

export default async function ContestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase, user } = await getMember();

  const { data: contest } = await supabase
    .from("contests")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!contest || contest.status === "draft") notFound();

  /* The standing is computed by a definer RPC — scoring reads every entrant's
     sailings, and no member can see those rows directly. */
  const [standingRes, entryRes] = await Promise.all([
    supabase.rpc("contest_standing", { p_contest_id: contest.id }),
    supabase
      .from("contest_entries")
      .select("*")
      .eq("contest_id", contest.id)
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  const standing = Array.isArray(standingRes.data) ? standingRes.data : [];
  const entered = Boolean(entryRes.data);
  const open = contest.status === "open";
  /* Server-rendered per request, so "now" is request time. */
  const closed = new Date(contest.ends_at).getTime() <= new Date().getTime();
  const isRegatta = contest.shape === "regatta";

  return (
    <div className="ls-fade">
      <Link href="/regattas" className="mbr-mono mbr-plain">
        <Icon name="ArrowUpRight" size={12} /> ALL {LOGBOOK.regattas.toUpperCase()}
      </Link>

      <span className="mbr-eyebrow" style={{ display: "block", marginTop: 18 }}>
        {isRegatta ? "Regatta" : "Challenge"} ·{" "}
        {contest.status === "settled" ? "Settled" : closed ? "Closed, awaiting result" : "Running"}
      </span>
      <h1 className="mbr-h1">{contest.title}</h1>
      {contest.blurb ? (
        <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-2)", maxWidth: "58ch" }}>
          {contest.blurb}
        </p>
      ) : null}

      <div className="rgt-meta" style={{ marginTop: 16 }}>
        <Badge tone="outline">
          {isRegatta
            ? `Ranked by ${CONTEST_METRIC[contest.metric] ?? contest.metric}`
            : `Reach ${contest.target} ${CONTEST_METRIC[contest.metric] ?? contest.metric}`}
        </Badge>
        <Badge tone="outline">
          {logDate(contest.starts_at)} — {logDate(contest.ends_at)} · {roman(new Date(contest.ends_at).getFullYear())}
        </Badge>
        {contest.knots_award > 0 ? (
          <Badge tone="outline">{knots(contest.knots_award)} to the winner</Badge>
        ) : null}
      </div>

      {contest.prize ? (
        <p style={{ marginTop: 14, fontSize: 13, color: "var(--text-2)" }}>{contest.prize}</p>
      ) : null}

      {open && !closed ? (
        <div style={{ marginTop: 22 }}>
          <form action={entered ? withdrawFromContest : enterContest}>
            <input type="hidden" name="contest" value={contest.id} />
            <input type="hidden" name="slug" value={contest.slug} />
            <Button type="submit" variant={entered ? "ghost" : "brass"}>
              {entered ? "Withdraw" : "Enter"}
            </Button>
          </form>
          {!entered ? (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
              Entering counts only the sailings inside the window. Nothing before it.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">
          {contest.status === "settled" ? "The result" : "Standing so far"}
        </span>
        {standing.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            No one has entered yet.
          </p>
        ) : (
          <table className="rgt-stand">
            <thead>
              <tr>
                {isRegatta ? <th style={{ width: 48 }}>—</th> : null}
                <th>Member</th>
                <th style={{ width: 140 }}>
                  {CONTEST_METRIC[contest.metric] ?? contest.metric}
                </th>
                {!isRegatta ? <th style={{ width: 100 }}>Reached</th> : null}
              </tr>
            </thead>
            <tbody>
              {standing.map((row) => (
                <tr key={row.profile_id} data-me={row.profile_id === user.id ? "1" : "0"}>
                  {isRegatta ? (
                    <td className="rgt-num">{row.place != null ? roman(row.place) : "—"}</td>
                  ) : null}
                  <td>
                    {row.handle ? (
                      <Link href={`/directory/${row.handle}`} className="mbr-plain">
                        {row.full_name ?? `@${row.handle}`}
                      </Link>
                    ) : (
                      (row.full_name ?? "A member")
                    )}
                    {row.profile_id === user.id ? <span className="rgt-you">YOU</span> : null}
                  </td>
                  <td className="rgt-num">{score(contest.metric, Number(row.score ?? 0))}</td>
                  {!isRegatta ? (
                    <td className="rgt-num">{row.met ? "Yes" : "Not yet"}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {contest.status !== "settled" ? (
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-3)" }}>
            Live from completed sailings inside the window. Final once the Bridge settles it.
          </p>
        ) : null}
      </section>
    </div>
  );
}
