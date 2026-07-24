"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, type ActionResult } from "../../staff";

function done(): ActionResult {
  revalidatePath("/bridge/manifests");
  return {};
}

/* Stamp the gangway — check a berth in with the operator's name on it. */
export async function checkInRsvp(rsvpId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: staffId })
    .eq("id", rsvpId);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Put a berth on a yacht — or take it back off (vesselId null). */
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

/* Spread the unassigned aboard across the flotilla — each berth goes to the
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
