import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { CrewClient, type CandidateRow, type EventRow, type RoleRow } from "./crew-client";
import { CrewTabs } from "./crew-tabs";
import { Rota, type BillingRow, type CrewOption, type GapRow } from "./rota";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  const { supabase } = await getOperator();

  const [rolesRes, candidatesRes, eventsRes, gapsRes, crewRes, billingRes, blackoutRes] =
    await Promise.all([
    supabase.from("crew_roles").select("*").order("position", { ascending: true }),
    supabase.from("crew_candidates").select("*").order("created_at", { ascending: false }),
    /* The whole history in one read. It is one row per stage move plus notes
       across a handful of candidates — a per-candidate fetch on open would be
       a round trip to show something already this small. */
    supabase.from("crew_candidate_events").select("*").order("at", { ascending: false }),
    /* The rota. Gaps come from the view, which already resolves needs against
       confirmations; the rest is what the picker needs to stop offering a night
       to somebody who cannot work it. */
    supabase.from("episode_crew_gaps").select("*").order("starts_at", { ascending: true }),
    supabase.from("crew").select("*").eq("active", true).order("position", { ascending: true }),
    supabase.from("crew_assignments").select("*"),
    supabase.from("crew_blackouts").select("*"),
  ]);

  const roles: RoleRow[] = (must(rolesRes)).map((r) => ({
    id: r.id,
    title: r.title,
    city: r.city,
    meta: r.meta ?? "",
    open: r.open,
  }));

  const candidates: CandidateRow[] = (must(candidatesRes)).map((c) => ({
    id: c.id,
    roleId: c.role_id,
    name: c.full_name,
    email: c.email,
    note: c.note ?? "",
    stage: c.stage,
    applied: logDateTime(c.created_at, CLUB_ZONE),
    phone: c.phone ?? "",
    links: c.links ?? "",
    source: c.source ?? "",
    rejectedReason: c.rejected_reason ?? "",
  }));

  const events: EventRow[] = (must(eventsRes)).map((e) => ({
    id: e.id,
    candidateId: e.candidate_id,
    at: logDateTime(e.at, CLUB_ZONE),
    kind: e.kind,
    fromStage: e.from_stage,
    toStage: e.to_stage,
    body: e.body ?? "",
  }));

  const crewRows = must(crewRes);
  const billingRows = must(billingRes);
  const blackoutRows = must(blackoutRes);
  const nameById = new Map(crewRows.map((c) => [c.id, c.display_name] as const));

  /* new Date() rather than Date.now(): the compiler's purity rule flags the
     latter by name, and every other server page in this app already reads the
     clock this way. */
  const nowMs = new Date().getTime();
  const gaps: GapRow[] = must(gapsRes).map((g) => ({
    episodeId: g.episode_id,
    slug: g.slug,
    title: g.title,
    starts: g.starts_at,
    daysOut: Math.floor((Date.parse(g.starts_at) - nowMs) / 86_400_000),
    setting: g.setting,
    positionSlug: g.position_slug,
    positionLabel: g.position_label,
    needed: g.needed,
    confirmed: g.confirmed,
    offered: g.offered,
    short: g.short,
  }));

  const crewOptions: CrewOption[] = crewRows.map((c) => ({
    id: c.id,
    name: c.display_name,
    roleTitle: c.role_title,
    onEpisodes: billingRows
      .filter((b) => b.crew_id === c.id && b.status !== "released" && b.status !== "declined")
      .map((b) => b.episode_id),
    blackouts: blackoutRows
      .filter((b) => b.crew_id === c.id)
      .map((b) => ({ from: b.from_date, to: b.to_date })),
  }));

  const billings: BillingRow[] = billingRows.map((b) => ({
    id: b.id,
    episodeId: b.episode_id,
    crewId: b.crew_id,
    crewName: nameById.get(b.crew_id) ?? "Someone",
    positionSlug: b.position_slug,
    status: b.status,
  }));

  return (
    <div>
      <span className="hm-eyebrow">Crew</span>
      <h1 className="hm-h1">Hiring, and who is working.</h1>
      <p className="hm-lede">
        The pipeline fills the crew list; the rota puts them on nights. A gap is
        a night nobody has confirmed for — an offer is not cover.
      </p>
      <CrewTabs
        pipeline={<CrewClient roles={roles} candidates={candidates} events={events} />}
        rota={<Rota gaps={gaps} crew={crewOptions} billings={billings} />}
        shortCount={gaps.filter((g) => g.short > 0).length}
      />
    </div>
  );
}
