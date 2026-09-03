"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";
import type { CrewCandidateRow } from "@/lib/supabase/types";

export type CrewStage = "applied" | "interview" | "sea_trial" | "offer" | "passed";

function done(): ActionResult {
  revalidatePath("/bridge/crew");
  revalidatePath("/crew");
  return {};
}

export async function setCandidateStage(
  candidateId: string,
  stage: CrewStage,
  /* Written onto the row so the stage trigger can pick it up and put it in the
     history with the move it explains — a reason recorded separately from the
     decision is a reason that drifts away from it. */
  reason?: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  /* Typed as the row's own Partial rather than a loose record — the generated
     Update type rejects excess properties, which is the point of it. */
  const patch: Partial<CrewCandidateRow> =
    stage === "passed"
      ? {
          stage,
          rejected_reason: reason?.trim() || null,
          decided_at: new Date().toISOString(),
          reviewed_by: staffId,
        }
      : { stage };
  const { error } = await supabase.from("crew_candidates").update(patch).eq("id", candidateId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* A note is an event, not a field. crew_candidates.note held whatever was typed
   last and forgot everything before it; this appends, and the table it appends
   to has no UPDATE grant and no update policy, so what is written stays. */
export async function addCandidateNote(
  candidateId: string,
  body: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const text = body.trim();
  if (text.length === 0) return { error: "Nothing to file." };
  const { error } = await supabase.from("crew_candidate_events").insert({
    candidate_id: candidateId,
    actor: staffId,
    kind: "note",
    body: text.slice(0, 4000),
  });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setRoleOpen(roleId: string, open: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("crew_roles").update({ open }).eq("id", roleId);
  if (error) return { error: ERR_LAND };
  return done();
}
