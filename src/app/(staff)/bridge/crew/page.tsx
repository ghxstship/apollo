import type { Metadata } from "next";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { CrewClient, type CandidateRow, type RoleRow } from "./crew-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Crew" };

export default async function CrewPage() {
  const { supabase } = await getOperator();

  const [rolesRes, candidatesRes] = await Promise.all([
    supabase.from("crew_roles").select("*").order("position", { ascending: true }),
    supabase.from("crew_candidates").select("*").order("created_at", { ascending: false }),
  ]);

  const roles: RoleRow[] = (must(rolesRes)).map((r) => ({
    id: r.id,
    title: r.title,
    port: r.port,
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
    applied: logDateTime(c.created_at),
  }));

  return (
    <div>
      <span className="hm-eyebrow">Crew</span>
      <h1 className="hm-h1">The pipeline.</h1>
      <p className="hm-lede">
        Applied, interview, sea trial, offer. Advance them or pass — kindly, in writing.
      </p>
      <CrewClient roles={roles} candidates={candidates} />
    </div>
  );
}
