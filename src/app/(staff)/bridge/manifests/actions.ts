"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, boardingError, type ActionResult } from "../../staff";

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
export async function checkInRsvp(rsvpId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { data: stamped, error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: staffId })
    .eq("id", rsvpId)
    .is("checked_in_at", null)
    .select("id");
  if (error) return { error: boardingError(error) };
  if (!stamped || stamped.length === 0) {
    /* Zero rows: either somebody boarded this pass already — in which case the
       right outcome is "they are aboard", not an error — or the pass is gone.
       Tell them apart rather than reporting success for both. */
    const { data: row } = await supabase
      .from("rsvps")
      .select("checked_in_at")
      .eq("id", rsvpId)
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
  voyageId: string,
  profileId: string,
  comp: boolean,
  guestNames: string[]
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const names = guestNames.map((n) => n.trim()).filter(Boolean).slice(0, 2);

  /* The database exempts staff from the past-sailing guard, on the assumption
     the Bridge knows what it is doing. It does not know that a tab has been
     open since before the episode completed. Seating someone retroactively
     mints knots, queues a boarding email for an episode that has happened,
     and — since contest_standing scores aboard rows on completed episodes —
     quietly moves regatta standings. The box office checks the clock itself. */
  const { data: target } = await supabase
    .from("voyages")
    .select("status, starts_at, title")
    .eq("id", voyageId)
    .maybeSingle();
  if (!target) return { error: "No such episode." };
  if (target.status === "cancelled") return { error: "That episode was called off." };
  if (target.status === "completed" || new Date(target.starts_at).getTime() <= Date.now()) {
    return { error: "That episode has already gone — nobody can be seated on it now." };
  }

  const { data: existing } = await supabase
    .from("rsvps")
    .select("id, status")
    .eq("voyage_id", voyageId)
    .eq("profile_id", profileId)
    .neq("status", "not_going")
    .maybeSingle();
  if (existing) return { error: "Already on this manifest." };

  const { error } = await supabase.from("rsvps").insert({
    voyage_id: voyageId,
    profile_id: profileId,
    status: "aboard",
    comp,
    guests: names.length,
    guest_names: names,
  });
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/gangway");
  return done();
}

/* Put a pass on a yacht — or take it back off (vesselId null). */
export async function setRsvpVessel(
  rsvpId: string,
  vesselId: string | null
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("rsvps")
    .update({ vessel_id: vesselId })
    .eq("id", rsvpId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Spread the unassigned aboard across the flotilla. One statement at the
   database (assign_vessels_evenly, definer, staff-only) deals the loose passes
   round the hulls in position order and reports how many moved — the per-row
   loop this replaced could be interrupted halfway and leave a flotilla
   half-levelled with no word. Passes holding a cabin already have a hull and
   are left where they are. */
export async function assignVesselsEvenly(voyageId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { data: moved, error } = await supabase.rpc("assign_vessels_evenly", { p_voyage: voyageId });
  if (error) return { error: error.code === "P0001" && error.message ? error.message : ERR_LAND };
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
