"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";
import type { CrewCandidateRow } from "@/lib/supabase/types";

export type CrewStage = "applied" | "interview" | "sea_trial" | "offer" | "passed";
export type AssignmentStatus = "offered" | "confirmed" | "declined" | "released";

/* Both are check constraints on their tables (crew_candidates.stage,
   crew_assignments.status). A value off either list is refused by the
   database with a constraint name; it is refused here first, in words. */
const STAGES: readonly CrewStage[] = ["applied", "interview", "sea_trial", "offer", "passed"];
const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ["offered", "confirmed", "declined", "released"];
const NOTE_MAX = 4000;

function done(): ActionResult {
  revalidatePath("/bridge/crew");
  revalidatePath("/crew");
  revalidatePath("/crew/wanted");
  /* A billing change shows on the episode page and on the crew member's own,
     and neither is worth a stale cache. */
  revalidatePath("/episodes", "layout");
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
  if (!STAGES.includes(stage)) return { error: "That is not a stage on the pipeline." };
  /* Typed as the row's own Partial rather than a loose record — the generated
     Update type rejects excess properties, which is the point of it. */
  const patch: Partial<CrewCandidateRow> =
    stage === "passed"
      ? {
          stage,
          rejected_reason: reason?.trim().slice(0, NOTE_MAX) || null,
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
    body: text.slice(0, NOTE_MAX),
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

/* — the rota — */

/* An OFFER. The word matters and so does the default status: a name written
   into a box by somebody else is not cover, and the gap view only counts a
   confirmation. The unique index on (episode_id, crew_id) is the backstop for
   the picker's own filtering. */
export async function assignCrew(
  episodeId: string,
  crewId: string,
  positionSlug: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!crewId) return { error: "Pick someone first." };
  /* position_slug is a foreign key onto crew_positions. The rota only ever
     offers a slug the gaps view handed it, but the wire is not the screen: a
     slug off the catalogue is refused here by name rather than as a foreign
     key violation. */
  const { data: position } = await supabase
    .from("crew_positions")
    .select("slug")
    .eq("slug", positionSlug)
    .maybeSingle();
  if (!position) return { error: "That position is not on the crew list." };
  const { error } = await supabase.from("crew_assignments").insert({
    episode_id: episodeId,
    crew_id: crewId,
    position_slug: positionSlug,
    status: "offered",
    assigned_by: staffId,
  });
  if (error) {
    if (error.code === "23505") return { error: "They are already on that episode." };
    return { error: ERR_LAND };
  }
  return done();
}

/* What a particular night needs of a position, overriding the setting's
   default. Zero is meaningful: it is how a night says it does not want a
   position its setting normally carries — and without it, a night that
   genuinely needs nobody on that post reported short forever, and a rota that
   cries wolf gets ignored. */
export async function setEpisodeNeed(
  episodeId: string,
  positionSlug: string,
  headcount: number
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!/^[0-9a-f-]{36}$/.test(episodeId)) return { error: ERR_LAND };
  if (!Number.isInteger(headcount) || headcount < 0 || headcount > 50) {
    return { error: "A headcount is a whole number, 0 to 50." };
  }
  const { data: pos } = await supabase.from("crew_positions").select("slug").eq("slug", positionSlug).maybeSingle();
  if (!pos) return { error: "No such position on the crew list." };

  const { error } = await supabase
    .from("episode_crew_needs")
    .upsert({ episode_id: episodeId, position_slug: positionSlug, headcount }, { onConflict: "episode_id,position_slug" });
  if (error) return { error: ERR_LAND };
  return done();
}

export async function setAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!ASSIGNMENT_STATUSES.includes(status)) return { error: "That is not an answer an offer can take." };
  const { error } = await supabase
    .from("crew_assignments")
    .update({ status })
    .eq("id", assignmentId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* — The door grant. A crew member on a confirmed assignment can be handed the
     gangway for that one night: they read the manifest and stamp arrivals, and
     nothing else. The grant expires six hours after the episode ends — or, for
     a night with no end on the books, six hours after start plus eight. The
     crew row has to be tied to a member profile; a name with no login has
     nothing for the door to check. — */

const UUID = /^[0-9a-f-]{36}$/;

/* A door grant is handed to a PROFILE; a crew row with none has nobody for
   the gangway to recognise. The link is made by handle, the one public name
   a member chooses, and refused if that member already stands on the crew
   list as somebody else. */
export async function linkCrewProfile(crewId: string, handle: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!/^[0-9a-f-]{36}$/.test(crewId)) return { error: ERR_LAND };
  const h = handle.trim().replace(/^@/, "");
  if (!/^[a-z0-9._-]{2,32}$/i.test(h)) return { error: "A handle, as it reads on their page." };

  const { data: person } = await supabase.from("profiles").select("id, full_name").ilike("handle", h).maybeSingle();
  if (!person) return { error: `No member answers to @${h}.` };
  const { data: taken } = await supabase.from("crew").select("id, display_name").eq("profile_id", person.id).neq("id", crewId).maybeSingle();
  if (taken) return { error: `${person.full_name ?? "That member"} is already on the crew list as ${taken.display_name}.` };

  const { error } = await supabase.from("crew").update({ profile_id: person.id }).eq("id", crewId);
  if (error) return { error: ERR_LAND };
  return done();
}

export async function grantTheDoor(assignmentId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(assignmentId)) return { error: ERR_LAND };

  const { data: a } = await supabase
    .from("crew_assignments")
    .select("episode_id, crew_id, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) return { error: "No such assignment on the rota." };
  if (a.status !== "confirmed") return { error: "The door goes with a confirmed assignment — an offer is not cover." };

  const [{ data: crew }, { data: episode }] = await Promise.all([
    supabase.from("crew").select("profile_id, display_name").eq("id", a.crew_id).maybeSingle(),
    supabase.from("episodes").select("starts_at, ends_at").eq("id", a.episode_id).maybeSingle(),
  ]);
  if (!crew) return { error: "That crew member is off the list." };
  if (!crew.profile_id) return { error: `${crew.display_name} has no member login to hand the door to — link their profile on the crew list first.` };
  if (!episode) return { error: "That episode is not on the board." };

  const endMs = episode.ends_at
    ? new Date(episode.ends_at).getTime()
    : new Date(episode.starts_at).getTime() + 8 * 3_600_000;
  const expiresAt = new Date(endMs + 6 * 3_600_000).toISOString();

  const { error } = await supabase
    .from("door_grants")
    .upsert(
      { profile_id: crew.profile_id, episode_id: a.episode_id, granted_by: staffId, expires_at: expiresAt },
      { onConflict: "profile_id,episode_id" }
    );
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/crew");
  revalidatePath("/bridge/gangway");
  return {};
}

export async function revokeTheDoor(grantId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(grantId)) return { error: ERR_LAND };
  const { error } = await supabase.from("door_grants").delete().eq("id", grantId);
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/crew");
  revalidatePath("/bridge/gangway");
  return {};
}
