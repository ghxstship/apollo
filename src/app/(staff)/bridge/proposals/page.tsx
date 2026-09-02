import type { Metadata } from "next";
import { logDate } from "@/lib/format";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { moduleTables } from "@/lib/module-tables";
import { ProposalsClient, type CharterRow, type ProposalRow } from "./proposals-client";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const { supabase } = await getOperator();

  const [proposalsRes, chartersRes, episodesRes] = await Promise.all([
    supabase
      .from("member_event_proposals")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("charter_requests").select("*").order("created_at", { ascending: false }),
    /* Two jobs from one read: the picker offers episodes still ahead; the
       label for a linked episode must resolve even after it has gone. */
    supabase
      .from("episodes")
      .select("id, title, starts_at, time_zone, status")
      .order("starts_at", { ascending: true }),
  ]);
  const proposals = must(proposalsRes);
  const charters = must(chartersRes);
  const episodes = must(episodesRes);
  const episodeById = new Map(episodes.map((v) => [v.id, v]));

  const memberIds = [
    ...new Set([...proposals.map((p) => p.proposer_id), ...charters.map((c) => c.profile_id)]),
  ];
  const membersRes = memberIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", memberIds)
    : { data: [] };
  const members = new Map(must(membersRes).map((p) => [p.id, p]));

  /* Labels for whatever series turn up on the rows. series belongs
     to another module, reached through the moduleTables seam. */
  const formatSlugs = [
    ...new Set(
      [...proposals.map((p) => p.series), ...charters.map((c) => c.series)].filter(
        (s): s is string => !!s
      )
    ),
  ];
  const { data: formatsData } = formatSlugs.length
    ? await moduleTables(supabase)
        .from("series")
        .select("slug, label, access")
        .in("slug", formatSlugs)
    : { data: [] };
  const formats = new Map(
    ((formatsData ?? []) as Array<{ slug: string; label: string; access: string }>).map((f) => [
      f.slug,
      f,
    ])
  );

  const voyageLabel = (id: string | null): string | null => {
    if (!id) return null;
    const v = episodeById.get(id);
    return v ? `${v.title} · ${logDate(v.starts_at, v.time_zone)}` : "An episode off the board";
  };

  const rows: ProposalRow[] = proposals.map((p) => {
    const proposer = members.get(p.proposer_id);
    const format = p.series ? formats.get(p.series) : undefined;
    return {
      id: p.id,
      proposer: proposer?.full_name ?? "A member",
      proposerMark: proposer?.member_no ?? null,
      title: p.title,
      format: p.series,
      seriesLabel: format?.label ?? p.series,
      note: p.note,
      proposedFor: p.proposed_for,
      status: p.status,
      decisionNote: p.decision_note,
      raisedAt: p.created_at,
      episodeId: p.episode_id,
      voyageLabel: voyageLabel(p.episode_id),
    };
  });

  const charterRows: CharterRow[] = charters.map((c) => {
    const member = members.get(c.profile_id);
    const format = c.series ? formats.get(c.series) : undefined;
    return {
      id: c.id,
      proposer: member?.full_name ?? "A member",
      proposerMark: member?.member_no ?? null,
      seriesLabel: format?.label ?? c.series,
      partySize: c.party_size,
      preferredDates: c.preferred_dates,
      note: c.note,
      status: c.status,
      decisionNote: c.decision_note,
      raisedAt: c.created_at,
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Proposals</span>
      <h1 className="hm-h1">What the members would raise.</h1>
      <p className="hm-lede">
        Gatherings and mixers raised from the member side, newest first. Every
        ruling reaches the proposer as a word — considering, approved, or
        declined with your reason on it. Nothing here is decided silently.
      </p>
      <ProposalsClient
        rows={rows}
        charters={charterRows}
        episodes={episodes
          .filter((v) => v.status === "scheduled" || v.status === "live")
          .map((v) => ({
            value: v.id,
            label: `${v.title} · ${logDate(v.starts_at, v.time_zone)}`,
          }))}
      />
    </div>
  );
}
