import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Icon, StandingsTable, type StandingRow } from "@/components/ds";
import { CONTEST_METRIC, knots, LOGBOOK } from "@/lib/brand";
import { logDate, roman } from "@/lib/format";
import { getMember } from "../../data";
import { ContestEntry } from "./entry-control";

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
  const { supabase, user, onHold, zone } = await getMember();

  const { data: contest } = await supabase
    .from("contests")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!contest || contest.status === "draft") notFound();

  /* The standing is computed by a definer RPC — scoring reads every entrant's
     episodes, and no member can see those rows directly. */
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

  /* A crew-scoped contest belongs to one episode, and contest_entries' INSERT
     policy says so: scope 'crew' requires an aboard pass on contest.episode_id.
     This page never asked. A member with no pass on that episode was shown
     Enter, pressed it, and the insert was refused by RLS — and the action threw
     the refusal away, so the page came back identical with no entry on it. Twice
     over, the product offered something it had already decided to say no to.

     A contest scoped to the crew with no episode named is enterable by nobody,
     which is a Bridge mistake rather than a member's; it reads the same way from
     here — the control stays off. Someone already entered who has since come off
     the pass keeps the control, because withdrawing is still allowed. */
  const crewOnly = contest.scope === "crew";
  let aboard = false;
  let sailing: { title: string; slug: string } | null = null;
  if (crewOnly && contest.episode_id) {
    const [passRes, voyageRes] = await Promise.all([
      supabase
        .from("passes")
        .select("id")
        .eq("episode_id", contest.episode_id)
        .eq("profile_id", user.id)
        .eq("status", "aboard")
        .maybeSingle(),
      supabase.from("episodes").select("title, slug").eq("id", contest.episode_id).maybeSingle(),
    ]);
    aboard = Boolean(passRes.data);
    sailing = voyageRes.data ?? null;
  }
  const mayEnter = !crewOnly || aboard;
  /* Server-rendered per request, so "now" is request time. */
  const closed = new Date(contest.ends_at).getTime() <= new Date().getTime();
  const isRegatta = contest.shape === "regatta";

  /* Kit StandingsTable rows. Ties share a place; the kit renders " =" on them.
     "You" is matched by display name, so make yours unambiguous. */
  const nameOf = (row: (typeof standing)[number]): string =>
    row.full_name ?? (row.handle ? `@${row.handle}` : "A member");
  const placeCounts = new Map<number, number>();
  for (const row of standing) {
    if (row.place != null)
      placeCounts.set(row.place, (placeCounts.get(row.place) ?? 0) + 1);
  }
  const youName = standing.find((r) => r.profile_id === user.id)
    ? nameOf(standing.find((r) => r.profile_id === user.id)!)
    : null;
  const rows: StandingRow[] = standing.map((row) => ({
    name: nameOf(row),
    score: score(contest.metric, Number(row.score ?? 0)),
    place: row.place,
    tie: row.place != null && (placeCounts.get(row.place) ?? 0) > 1,
    reached: Boolean(row.met),
  }));

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
          {logDate(contest.starts_at, zone)} — {logDate(contest.ends_at, zone)} · {roman(new Date(contest.ends_at).getFullYear())}
        </Badge>
        {contest.knots_award > 0 ? (
          <Badge tone="outline">
            {isRegatta
              ? `${knots(contest.knots_award)} — split I / II / III`
              : `${knots(contest.knots_award)} on reaching it`}
          </Badge>
        ) : null}
      </div>

      {contest.prize ? (
        <p style={{ marginTop: 14, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>{contest.prize}</p>
      ) : null}

      {open && !closed && onHold ? (
        <p style={{ marginTop: 22, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
          Entries wait while your membership is paused. Resume it on your page
          and this contest opens back up.
        </p>
      ) : open && !closed && !mayEnter && !entered ? (
        <p style={{ marginTop: 22, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
          This one is the crew&rsquo;s — it counts{" "}
          {sailing ? (
            <Link href={`/episodes/${sailing.slug}`} className="mbr-plain">
              {sailing.title}
            </Link>
          ) : (
            "one episode"
          )}
          , and entry opens with a pass on it.
        </p>
      ) : open && !closed ? (
        <div style={{ marginTop: 22 }}>
          <ContestEntry contestId={contest.id} slug={contest.slug} entered={entered} />
          {!entered ? (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
              Entering counts only the episodes inside the window. Nothing before it.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="mbr-sec">
        <span className="mbr-eyebrow">
          {contest.status === "settled" ? "The result" : "Standing so far"}
        </span>
        {standing.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-3)" }}>
            No one has entered yet.
          </p>
        ) : (
          <StandingsTable
            shape={isRegatta ? "regatta" : "challenge"}
            frozen={contest.status === "settled"}
            youName={youName}
            rows={rows}
            style={{ marginTop: 12 }}
          />
        )}
        {contest.status !== "settled" ? (
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-3)" }}>
            Live from completed episodes inside the window. Final once the Bridge settles it.
          </p>
        ) : null}
      </section>
    </div>
  );
}
