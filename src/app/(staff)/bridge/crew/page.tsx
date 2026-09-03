import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { CrewClient, type CandidateRow, type EventRow, type RoleRow } from "./crew-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  const { supabase } = await getOperator();

  const [rolesRes, candidatesRes, eventsRes] = await Promise.all([
    supabase.from("crew_roles").select("*").order("position", { ascending: true }),
    supabase.from("crew_candidates").select("*").order("created_at", { ascending: false }),
    /* The whole history in one read. It is one row per stage move plus notes
       across a handful of candidates — a per-candidate fetch on open would be
       a round trip to show something already this small. */
    supabase.from("crew_candidate_events").select("*").order("at", { ascending: false }),
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

  return (
    <div>
      <span className="hm-eyebrow">Crew</span>
      <h1 className="hm-h1">The pipeline.</h1>
      <p className="hm-lede">
        Applied, interview, sea trial, offer. Advance them or pass — kindly, in writing.
      </p>
      <CrewClient roles={roles} candidates={candidates} events={events} />
    </div>
  );
}
