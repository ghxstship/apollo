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

/* Every id this file takes is a row id off the screen. A malformed one reaches
   the driver as "invalid input syntax for type uuid", which names a Postgres
   type at an operator who never chose one; refused here instead, before the
   round trip. */
const UUID = /^[0-9a-f-]{36}$/;

/* The stage trigger's own words, kept in step with a_stage_is_earned_in_order:
   the pipeline is walked one step at a time, and only "passed" is reachable
   from anywhere. Checked here so the refusal names the two stages in the
   words the screen uses, rather than a trigger message with underscores in it. */
const NEXT_STAGE: Partial<Record<CrewStage, CrewStage>> = {
  applied: "interview",
  interview: "sea_trial",
  sea_trial: "offer",
};
const STAGE_WORD: Record<CrewStage, string> = {
  applied: "applied",
  interview: "interview",
  sea_trial: "sea trial",
  offer: "offer",
  passed: "passed",
};

/* The calendar day an instant falls on in a zone, as YYYY-MM-DD — the shape
   crew_blackouts.from_date/to_date compare against. A blackout is a day in
   the crew member's week, not a UTC date; a night that starts at 23:00 in
   Miami is 03:00 UTC the next day, and the wrong day would let the picker's
   refusal and this one disagree. */
function localDay(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

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
  if (!UUID.test(candidateId)) return { error: ERR_LAND };
  if (!STAGES.includes(stage)) return { error: "That is not a stage on the pipeline." };

  /* The database walks the pipeline in order and refuses a skipped step — but
     that refusal used to come back as "That didn't land. Try again.", which is
     the one thing an operator cannot act on. Read where they stand and say
     which step is next. */
  const { data: current, error: readError } = await supabase
    .from("crew_candidates")
    .select("stage")
    .eq("id", candidateId)
    .maybeSingle();
  if (readError) return { error: ERR_LAND };
  if (!current) return { error: "That candidate is no longer in the queue." };
  const from = current.stage as CrewStage;
  if (from !== stage && stage !== "passed" && NEXT_STAGE[from] !== stage) {
    return {
      error: `The pipeline runs applied, interview, sea trial, offer — ${STAGE_WORD[stage]} does not follow ${STAGE_WORD[from]}.`,
    };
  }

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
  if (error) {
    /* Two operators moving the same card at once: the trigger still speaks. */
    if (/does not follow/i.test(error.message)) {
      return { error: "Somebody moved this candidate a moment ago — the board has been refreshed." };
    }
    return { error: ERR_LAND };
  }
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
  if (!UUID.test(candidateId)) return { error: ERR_LAND };
  const text = body.trim();
  if (text.length === 0) return { error: "Nothing to file." };
  if (text.length > NOTE_MAX) return { error: `A note runs to ${NOTE_MAX.toLocaleString("en")} characters.` };
  const { error } = await supabase.from("crew_candidate_events").insert({
    candidate_id: candidateId,
    actor: staffId,
    kind: "note",
    body: text,
  });
  if (error) {
    /* The candidate row is the note's parent; a card struck from the queue
       while the note was being typed has nowhere to file it. */
    if (error.code === "23503") return { error: "That candidate is no longer in the queue." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function setRoleOpen(roleId: string, open: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(roleId)) return { error: ERR_LAND };
  if (typeof open !== "boolean") return { error: "A role is open or it is not." };
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
  if (!UUID.test(crewId) || !UUID.test(episodeId)) return { error: ERR_LAND };
  /* position_slug is a foreign key onto crew_positions. The rota only ever
     offers a slug the gaps view handed it, but the wire is not the screen: a
     slug off the catalogue is refused here by name rather than as a foreign
     key violation. */
  const slug = positionSlug.trim();
  if (!slug) return { error: "That position is not on the crew list." };
  const { data: position } = await supabase
    .from("crew_positions")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!position) return { error: "That position is not on the crew list." };

  /* A blackout is a day the person said they cannot work. The picker hides a
     blacked-out name, but the picker is a screen and this is the wire — and
     the table has no rule of its own yet (see the SQL notes: a trigger on
     crew_assignments should read crew_blackouts). The day is the episode's
     own, in its own zone, the way the rota's picker reads it. */
  const { data: night } = await supabase.from("episodes").select("starts_at, time_zone").eq("id", episodeId).maybeSingle();
  if (!night) return { error: "That episode is not on the board." };
  const day = localDay(night.starts_at, night.time_zone);
  const { data: dark } = await supabase
    .from("crew_blackouts")
    .select("id")
    .eq("crew_id", crewId)
    .lte("from_date", day)
    .gte("to_date", day)
    .limit(1);
  if (dark?.length) return { error: "They are marked unavailable that day — pick someone else or clear the blackout first." };

  const { error } = await supabase.from("crew_assignments").insert({
    episode_id: episodeId,
    crew_id: crewId,
    position_slug: slug,
    status: "offered",
    assigned_by: staffId,
  });
  if (error) {
    if (error.code === "23505") return { error: "They are already on that episode." };
    /* The episode or the crew member went off the board between the gaps view
       loading and the offer being made. */
    if (error.code === "23503") return { error: "That night, or that person, is no longer on the board." };
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
  if (!UUID.test(episodeId)) return { error: ERR_LAND };
  if (!Number.isInteger(headcount) || headcount < 0 || headcount > 50) {
    return { error: "A headcount is a whole number, 0 to 50." };
  }
  const slug = positionSlug.trim();
  if (!slug) return { error: "No such position on the crew list." };
  const { data: pos } = await supabase.from("crew_positions").select("slug").eq("slug", slug).maybeSingle();
  if (!pos) return { error: "No such position on the crew list." };

  const { error } = await supabase
    .from("episode_crew_needs")
    .upsert({ episode_id: episodeId, position_slug: slug, headcount }, { onConflict: "episode_id,position_slug" });
  if (error) {
    if (error.code === "23503") return { error: "That night is no longer on the board." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function setAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(assignmentId)) return { error: ERR_LAND };
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

/* A door grant is handed to a PROFILE; a crew row with none has nobody for
   the gangway to recognise. The link is made by handle, the one public name
   a member chooses, and refused if that member already stands on the crew
   list as somebody else. */
export async function linkCrewProfile(crewId: string, handle: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(crewId)) return { error: ERR_LAND };
  const h = handle.trim().replace(/^@/, "");
  if (!/^[a-z0-9._-]{2,32}$/i.test(h)) return { error: "A handle, as it reads on their page." };

  /* ilike reads % and _ as wildcards, and _ is a legal handle character — so
     @jo_n matched @john and linked the wrong member. Escaped, the pattern is
     the handle and nothing else; case-insensitive is still wanted, since a
     handle is typed from memory. */
  const pattern = h.replace(/[\\%_]/g, "\\$&");
  const { data: person } = await supabase.from("profiles").select("id, full_name").ilike("handle", pattern).maybeSingle();
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
