import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { CrewClient, type CandidateRow, type EventRow, type RoleRow } from "./crew-client";
import { CrewTabs } from "./crew-tabs";
import { Rota, type BillingRow, type CrewOption, type DoorRow, type GapRow } from "./rota";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  const { supabase } = await getOperator();

  const [rolesRes, candidatesRes, eventsRes, gapsRes, crewRes, billingRes, blackoutRes, grantsRes, nightsRes] =
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
    /* Live door grants — the gangway handed to crew for one night each. */
    supabase.from("door_grants").select("*").gt("expires_at", new Date().toISOString()),
    /* The nights ahead, for the door: a confirmed assignment on one of these
       can be handed the gangway. */
    supabase
      .from("episodes")
      .select("id, title, starts_at, ends_at, time_zone")
      .gte("starts_at", new Date(new Date().getTime() - 24 * 3_600_000).toISOString())
      .in("status", ["scheduled", "live", "weather_hold"])
      .order("starts_at", { ascending: true }),
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

  /* The door: every confirmed assignment on a night ahead, with the grant it
     carries if any. One row per assignment, so Grant and Revoke sit on the
     same line as the name. */
  const nights = must(nightsRes);
  const grants = must(grantsRes);
  const crewById = new Map(crewRows.map((c) => [c.id, c] as const));
  const doors: DoorRow[] = billingRows
    .filter((b) => b.status === "confirmed" && nights.some((n) => n.id === b.episode_id))
    .map((b) => {
      const night = nights.find((n) => n.id === b.episode_id)!;
      const person = crewById.get(b.crew_id);
      const grant = person?.profile_id
        ? grants.find((g) => g.profile_id === person.profile_id && g.episode_id === b.episode_id)
        : undefined;
      return {
        assignmentId: b.id,
        episodeTitle: night.title,
        when: logDateTime(night.starts_at, night.time_zone),
        startsAt: night.starts_at,
        crewName: person?.display_name ?? "Someone",
        positionSlug: b.position_slug,
        linked: !!person?.profile_id,
        grantId: grant?.id ?? null,
        grantExpires: grant ? logDateTime(grant.expires_at, night.time_zone) : null,
      };
    })
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));

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
        rota={<Rota gaps={gaps} crew={crewOptions} billings={billings} doors={doors} />}
        shortCount={gaps.filter((g) => g.short > 0).length}
      />
    </div>
  );
}
