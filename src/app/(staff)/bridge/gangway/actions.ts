"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND } from "../../staff";

/* Onsite check-in by boarding code. The scanner types the code and hits
   Enter; we stamp checked_in_at/by and hand back what the door needs. */

export type ScanResult = {
  error?: string;
  outcome?: "aboard" | "already" | "not_found";
  name?: string;
  memberNo?: string;
  vessel?: string;
  guestNames?: string[];
  checkedInAt?: string;
  /* Set when the code matched a different upcoming voyage than the one
     selected — the panel says which. */
  otherVoyage?: string;
};

const UPCOMING_STATUSES: Array<"scheduled" | "live" | "weather_hold"> = [
  "scheduled",
  "live",
  "weather_hold",
];

function upcomingCutoff(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

export async function gangwayCheckIn(rawCode: string, voyageId: string): Promise<ScanResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const code = rawCode.trim();
  if (!code) return { error: "Type or scan a code first." };

  /* Selected voyage first; fall back to any upcoming voyage. */
  let { data: rsvp } = await supabase
    .from("rsvps")
    .select("*")
    .eq("voyage_id", voyageId)
    .ilike("boarding_code", code)
    .neq("status", "not_going")
    .maybeSingle();

  let otherVoyage: string | undefined;
  if (!rsvp) {
    const { data: upcoming } = await supabase
      .from("voyages")
      .select("id, title")
      .gte("starts_at", upcomingCutoff())
      .in("status", UPCOMING_STATUSES);
    const ids = (upcoming ?? []).map((v) => v.id).filter((id) => id !== voyageId);
    if (ids.length) {
      const { data: fallback } = await supabase
        .from("rsvps")
        .select("*")
        .in("voyage_id", ids)
        .ilike("boarding_code", code)
        .neq("status", "not_going")
        .maybeSingle();
      if (fallback) {
        rsvp = fallback;
        otherVoyage = (upcoming ?? []).find((v) => v.id === fallback.voyage_id)?.title;
      }
    }
  }

  if (!rsvp) return { outcome: "not_found" };

  const [{ data: profile }, vesselName] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, member_no")
      .eq("id", rsvp.profile_id)
      .maybeSingle(),
    (async () => {
      if (!rsvp.vessel_id) return undefined;
      const { data: vessel } = await supabase
        .from("vessels")
        .select("name")
        .eq("id", rsvp.vessel_id)
        .maybeSingle();
      return vessel?.name;
    })(),
  ]);

  const base: ScanResult = {
    name: profile?.full_name ?? "Unknown sailor",
    memberNo: profile?.member_no ?? "GUEST",
    vessel: vesselName,
    guestNames: rsvp.guest_names ?? [],
    otherVoyage,
  };

  if (rsvp.checked_in_at) return { ...base, outcome: "already", checkedInAt: rsvp.checked_in_at };

  const checkedInAt = new Date().toISOString();
  const { error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: checkedInAt, checked_in_by: staffId })
    .eq("id", rsvp.id);
  /* The waiver gate refuses at the database. Hand the skipper the reason and
     what to do about it rather than a generic failure — the fix is thirty
     seconds on the member's own phone. */
  if (error) {
    if (/boards unsigned/i.test(error.message)) {
      return { error: `${error.message.replace(/^.*— /, "")} — send them the link to sign, then scan again.` };
    }
    return { error: ERR_LAND };
  }

  revalidatePath("/bridge/gangway");
  revalidatePath("/bridge/manifests");
  return { ...base, outcome: "aboard", checkedInAt };
}

/* Flush one queued offline check-in — keeps the original stamp time.
   A no-op when someone else already stamped the row. */
export async function gangwayFlush(rsvpId: string, atIso: string): Promise<{ error?: string }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const at = new Date(atIso);
  const stamp = Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
  const { error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: stamp, checked_in_by: staffId })
    .eq("id", rsvpId)
    .is("checked_in_at", null);
  if (error) {
    /* A queued offline check-in can land against an unsigned member; the queue
       keeps it rather than silently dropping the stamp. */
    if (/boards unsigned/i.test(error.message)) {
      return { error: error.message.replace(/^.*— /, "") };
    }
    return { error: ERR_LAND };
  }
  revalidatePath("/bridge/gangway");
  revalidatePath("/bridge/manifests");
  return {};
}
