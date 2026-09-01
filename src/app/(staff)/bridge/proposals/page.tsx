import type { Metadata } from "next";
import { getOperator } from "../../data";
import { must } from "../../staff";
import { moduleTables } from "@/lib/module-tables";
import { ProposalsClient, type ProposalRow } from "./proposals-client";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const { supabase } = await getOperator();

  const proposalsRes = await supabase
    .from("member_event_proposals")
    .select("*")
    .order("created_at", { ascending: false });
  const proposals = must(proposalsRes);

  const proposerIds = [...new Set(proposals.map((p) => p.proposer_id))];
  const proposersRes = proposerIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", proposerIds)
    : { data: [] };
  const proposers = new Map(must(proposersRes).map((p) => [p.id, p]));

  /* Labels for whatever shapes turn up on the rows. activity_formats belongs
     to another module, reached through the moduleTables seam. */
  const formatSlugs = [
    ...new Set(proposals.map((p) => p.format).filter((s): s is string => !!s)),
  ];
  const { data: formatsData } = formatSlugs.length
    ? await moduleTables(supabase)
        .from("activity_formats")
        .select("slug, label, access")
        .in("slug", formatSlugs)
    : { data: [] };
  const formats = new Map(
    ((formatsData ?? []) as Array<{ slug: string; label: string; access: string }>).map((f) => [
      f.slug,
      f,
    ])
  );

  const rows: ProposalRow[] = proposals.map((p) => {
    const proposer = proposers.get(p.proposer_id);
    const format = p.format ? formats.get(p.format) : undefined;
    return {
      id: p.id,
      proposer: proposer?.full_name ?? "A member",
      proposerMark: proposer?.member_no ?? null,
      title: p.title,
      format: p.format,
      formatLabel: format?.label ?? p.format,
      note: p.note,
      proposedFor: p.proposed_for,
      status: p.status,
      decisionNote: p.decision_note,
      raisedAt: p.created_at,
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
      <ProposalsClient rows={rows} />
    </div>
  );
}
