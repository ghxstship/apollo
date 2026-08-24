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
     open since before the voyage completed. Seating someone retroactively mints
     knots, queues a boarding email for a sailing that has happened, and — since
     contest_standing scores aboard rows on completed voyages — quietly moves
     regatta standings. The box office checks the clock itself. */
  const { data: target } = await supabase
    .from("voyages")
    .select("status, starts_at, title")
    .eq("id", voyageId)
    .maybeSingle();
  if (!target) return { error: "No such sailing." };
  if (target.status === "cancelled") return { error: "That sailing was called off." };
  if (target.status === "completed" || new Date(target.starts_at).getTime() <= Date.now()) {
    return { error: "That sailing has already left — nobody can be seated on it now." };
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

/* Spread the unassigned aboard across the flotilla — each pass goes to the
   least-loaded yacht in turn, so the boats level out. */
export async function assignVesselsEvenly(voyageId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const [vvRes, rsvpsRes] = await Promise.all([
    supabase
      .from("voyage_vessels")
      .select("vessel_id, position")
      .eq("voyage_id", voyageId)
      .order("position", { ascending: true }),
    supabase
      .from("rsvps")
      .select("id, vessel_id, created_at")
      .eq("voyage_id", voyageId)
      .eq("status", "aboard")
      .order("created_at", { ascending: true }),
  ]);
  if (vvRes.error || rsvpsRes.error) return { error: ERR_LAND };

  const vessels = vvRes.data ?? [];
  if (vessels.length === 0) return { error: "No yachts assigned to this voyage yet." };

  const load = new Map<string, number>(vessels.map((v) => [v.vessel_id, 0]));
  for (const r of rsvpsRes.data ?? []) {
    if (r.vessel_id && load.has(r.vessel_id))
      load.set(r.vessel_id, (load.get(r.vessel_id) ?? 0) + 1);
  }

  const unassigned = (rsvpsRes.data ?? []).filter((r) => !r.vessel_id);
  if (unassigned.length === 0) return {};

  for (const r of unassigned) {
    /* Least-loaded first; ties break on flotilla position order. */
    let pick = vessels[0].vessel_id;
    for (const v of vessels) {
      if ((load.get(v.vessel_id) ?? 0) < (load.get(pick) ?? 0)) pick = v.vessel_id;
    }
    const { error } = await supabase.from("rsvps").update({ vessel_id: pick }).eq("id", r.id);
    if (error) return { error: ERR_LAND };
    load.set(pick, (load.get(pick) ?? 0) + 1);
  }
  return done();
}
