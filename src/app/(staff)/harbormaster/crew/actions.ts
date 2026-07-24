"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

export type CrewStage = "applied" | "interview" | "sea_trial" | "offer" | "passed";

function done(): ActionResult {
  revalidatePath("/harbormaster/crew");
  revalidatePath("/crew");
  return {};
}

export async function setCandidateStage(
  candidateId: string,
  stage: CrewStage
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("crew_candidates")
    .update({ stage })
    .eq("id", candidateId);
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
