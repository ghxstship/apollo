"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { staffContext, ERR_STAFF, ERR_LAND, boardingError, type ActionResult } from "../../staff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* guard_the_vetting and guard_the_ratio hold the Bridge to the same gate as
   the member, and speak to the member — "your vetting file is not open yet".
   The operator reading that is not the one being refused, so the sentence is
   turned round before it reaches them. */
const VETTING_REFUSAL = /vetting file|clearance|Preference Sheet|25 to 45|video call/i;

function done(): ActionResult {
  revalidatePath("/bridge/manifests");
  return {};
}

/* Stamp the gangway — check a pass in with the operator's name on it.

   Narrowed on the prior state. Without it a second crew phone silently
   overwrote the original boarding time AND the operator who made it — and that
   pair is the audit record for an incident: who let this person aboard, and
   when. The gangway's flush path has done this since it was written; this one
   and the scanner both did not. */
export async function checkInPass(passId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(passId)) return { error: "That pass is no longer on the manifest." };
  const { data: stamped, error } = await supabase
    .from("passes")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: staffId })
    .eq("id", passId)
    .is("checked_in_at", null)
    .select("id");
  if (error) {
    /* The waiver gate gets its fix appended; every other refusal the gangway
       raises — "no seat has come free for this standby pass" — is already in
       the club's voice and used to be flattened to "That didn't land". */
    const said = boardingError(error);
    return { error: said === ERR_LAND ? voice(error) : said };
  }
  if (!stamped || stamped.length === 0) {
    /* Zero rows: either somebody boarded this pass already — in which case the
       right outcome is "they are aboard", not an error — or the pass is gone.
       Tell them apart rather than reporting success for both. */
    const { data: row } = await supabase
      .from("passes")
      .select("checked_in_at")
      .eq("id", passId)
      .maybeSingle();
    if (!row) return { error: "That pass is no longer on the manifest." };
    if (!row.checked_in_at) return { error: ERR_LAND };
    /* Already aboard, stamped by someone else. Nothing to do and nothing wrong. */
  }
  return done();
}

/* Walk a member onto the manifest from the box office — comp set on the
   insert means the trigger skips the house charge; the DB guard already
   exempts staff from booking limits. */
export async function addToManifest(
  episodeId: string,
  profileId: string,
  comp: boolean,
  guestNames: string[]
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(episodeId)) return { error: "Pick the episode first." };
  if (!UUID.test(profileId)) return { error: "Pick the member first." };

  const names = (guestNames ?? []).map((n) => String(n ?? "").trim()).filter(Boolean).slice(0, 2);

  /* The database exempts staff from the past-sailing guard, on the assumption
     the Bridge knows what it is doing. It does not know that a tab has been
     open since before the episode completed. Seating someone retroactively
     mints knots, queues a boarding email for an episode that has happened,
     and — since contest_standing scores aboard rows on completed episodes —
     quietly moves regatta standings. The box office checks the clock itself. */
  const { data: target } = await supabase
    .from("episodes")
    .select("status, starts_at, title")
    .eq("id", episodeId)
    .maybeSingle();
  if (!target) return { error: "No such episode." };
  if (target.status === "cancelled") return { error: "That episode was called off." };
  if (target.status === "completed" || new Date(target.starts_at).getTime() <= Date.now()) {
    return { error: "That episode has already gone — nobody can be seated on it now." };
  }

  const { data: existing } = await supabase
    .from("passes")
    .select("id, status")
    .eq("episode_id", episodeId)
    .eq("profile_id", profileId)
    .neq("status", "not_going")
    .maybeSingle();
  if (existing) return { error: "Already on this manifest." };

  const { error } = await supabase.from("passes").insert({
    episode_id: episodeId,
    profile_id: profileId,
    status: "aboard",
    comp,
    guests: names.length,
    guest_names: names,
  });
  if (error) {
    /* Two operators seating the same member at once: the unique pair, not the
       read above, is what decides it. */
    if (error.code === "23505") return { error: "Already on this manifest." };
    if (error.code === "23503") return { error: "That member is not on the roll." };
    if (VETTING_REFUSAL.test(error.message ?? ""))
      return { error: "That member is not cleared for this episode yet — the vetting file comes first." };
    /* guard_the_ratio does not exempt the Bridge, by design, and says why. */
    return { error: voice(error) };
  }
  revalidatePath("/bridge/gangway");
  return done();
}

/* Put a pass on a yacht — or take it back off (vesselId null). */
export async function setPassVessel(
  passId: string,
  vesselId: string | null
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(passId)) return { error: "That pass is no longer on the manifest." };
  if (vesselId !== null && !UUID.test(vesselId)) return { error: "Pick the hull from the list." };
  const { error } = await supabase
    .from("passes")
    .update({ vessel_id: vesselId })
    .eq("id", passId);
  if (error) return { error: error.code === "23503" ? "That hull is not in the fleet." : ERR_LAND };
  return done();
}

/* Spread the unassigned aboard across the flotilla. One statement at the
   database (assign_vessels_evenly, definer, staff-only) deals the loose passes
   round the hulls in position order and reports how many moved — the per-row
   loop this replaced could be interrupted halfway and leave a flotilla
   half-levelled with no word. Passes holding a cabin already have a hull and
   are left where they are. */
export async function assignVesselsEvenly(episodeId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(episodeId)) return { error: "Pick the episode first." };

  const { data: moved, error } = await supabase.rpc("assign_vessels_evenly", { p_episode: episodeId });
  if (error) {
    if (/staff only/i.test(error.message ?? "")) return { error: ERR_STAFF };
    return { error: voice(error) };
  }
  if (!moved) {
    /* Zero rows is one of two things — no hull to deal onto, or nothing loose
       to deal — and either way "spread" would be the wrong word. */
    return {
      error:
        "Nothing to spread — no hull is on this episode yet, or every pass aboard already has one. Assign hulls from the Episodes board first.",
    };
  }
  return done();
}
