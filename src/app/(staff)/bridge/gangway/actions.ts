"use server";

import { revalidatePath } from "next/cache";
import { staffContext, ERR_STAFF, ERR_LAND, boardingError } from "../../staff";
import { logDateYear } from "@/lib/format";

/* Onsite check-in by boarding code. The scanner types the code and hits
   Enter; we stamp checked_in_at/by and hand back what the door needs. */

export type ScanResult = {
  error?: string;
  outcome?: "aboard" | "already" | "not_found";
  /* Set when the code scanned was a guest's stub rather than a member's pass. */
  guestOf?: string;
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

/* Boarding codes were matched with .ilike(), and % and _ are WILDCARDS there.
   A QR encoding `UN-NIGH-0823-003%` matched whatever it resolved to and
   boarded that person — a scanned value is untrusted input, and this is the
   one place the club turns a scanned value into a person walking aboard.
   Codes are fixed-shape and case-insensitive, so upper() + eq() answers the
   real question and leaves no pattern syntax in play. */
function literalCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function upcomingCutoff(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

export async function gangwayCheckIn(rawCode: string, voyageId: string): Promise<ScanResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const code = literalCode(rawCode);
  if (!code) return { error: "Type or scan a code first." };

  /* Selected voyage first; fall back to any upcoming voyage. */
  let { data: rsvp } = await supabase
    .from("rsvps")
    .select("*")
    .eq("voyage_id", voyageId)
    .eq("boarding_code", code)
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
        .eq("boarding_code", code)
        .neq("status", "not_going")
        .maybeSingle();
      if (fallback) {
        rsvp = fallback;
        otherVoyage = (upcoming ?? []).find((v) => v.id === fallback.voyage_id)?.title;
      }
    }
  }

  /* A guest stub carries its own code (…-G1) and its own signature gate. The
     scanner could only ever resolve rsvps.boarding_code, so every guest stub
     the product issues — printed on the host's manifest, rendered as a QR, and
     captioned "Present at the gangway" — came back as "No pass under that
     code", and the guest waiver gate (a trigger on rsvp_guests.checked_in_at)
     never fired because nothing in the product ever wrote that column. */
  if (!rsvp) {
    const { data: guest } = await supabase
      .from("rsvp_guests")
      .select("*")
      .eq("boarding_code", code)
      .maybeSingle();

    if (!guest) {
      /* Before calling it a forgery: the fallback above only searches sailings
         still ahead, so a pass for a sailing that has already gone came back as
         "No pass matches that code on this voyage." The skipper is standing in
         front of somebody holding a real pass and being told it is not real.
         Look it up unscoped and say which sailing it was for. */
      const { data: old } = await supabase
        .from("rsvps")
        .select("voyage_id")
        .eq("boarding_code", code)
        .maybeSingle();
      if (old) {
        const { data: v } = await supabase
          .from("voyages")
          .select("title, starts_at, time_zone, status")
          .eq("id", old.voyage_id)
          .maybeSingle();
        if (v) {
          return {
            error:
              v.status === "cancelled"
                ? `That pass is for ${v.title}, which was called off.`
                : `That pass is for ${v.title}, which sailed on ${logDateYear(v.starts_at, v.time_zone)}.`,
          };
        }
      }
      return { outcome: "not_found" };
    }

    const { data: guestRsvp } = await supabase
      .from("rsvps")
      .select("*")
      .eq("id", guest.rsvp_id)
      .maybeSingle();

    /* The guest rides on the host's pass: no pass, no boarding. Without this
       the scanner walked aboard a guest whose host had already released. */
    if (!guestRsvp || guestRsvp.status !== "aboard") {
      return { error: "That guest's host is not aboard — no pass, no boarding." };
    }

    const { data: host } = guestRsvp
      ? await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", guestRsvp.profile_id)
          .maybeSingle()
      : { data: null };

    const base: ScanResult = {
      name: guest.name ?? "A guest",
      memberNo: "GUEST",
      guestOf: host?.full_name ?? undefined,
      guestNames: [],
    };

    if (guest.checked_in_at) {
      return { ...base, outcome: "already", checkedInAt: guest.checked_in_at };
    }

    const guestAt = new Date().toISOString();
    const { error: guestError } = await supabase
      .from("rsvp_guests")
      .update({ checked_in_at: guestAt, checked_in_by: staffId })
      .eq("id", guest.id);

    if (guestError) return { error: boardingError(guestError) };

    revalidatePath("/bridge/gangway");
    revalidatePath("/bridge/manifests");
    return { ...base, outcome: "aboard", checkedInAt: guestAt };
  }

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

  /* Read-then-write: two scanners on the same code both read null and both
     wrote, so the second overwrote the first's time and operator — and that
     pair is the audit record for an incident. Narrowed on the prior state, so
     only one stamp lands and the other learns it was second. gangwayFlush has
     done this since it was written; this path had not. */
  const checkedInAt = new Date().toISOString();
  const { data: stamped, error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: checkedInAt, checked_in_by: staffId })
    .eq("id", rsvp.id)
    .is("checked_in_at", null)
    .select("checked_in_at");
  if (error) return { error: boardingError(error) };
  if (!stamped || stamped.length === 0) {
    /* Somebody stamped it between our read and our write. Not our stamp, and
       not a failure — the person is aboard. */
    const { data: fresh } = await supabase
      .from("rsvps")
      .select("checked_in_at")
      .eq("id", rsvp.id)
      .maybeSingle();
    return { ...base, outcome: "already", checkedInAt: fresh?.checked_in_at ?? checkedInAt };
  }

  revalidatePath("/bridge/gangway");
  revalidatePath("/bridge/manifests");
  return { ...base, outcome: "aboard", checkedInAt };
}

/* Flush one queued offline check-in — keeps the original stamp time.
   A no-op when someone else already stamped the row. */
/* `final` marks a refusal that will not change on a retry — the member has not
   signed, so this stamp will be refused every time until they do. Everything
   else (a staff context that blinked, any other database error) is
   INDETERMINATE, and the caller must keep it queued: a queued stamp is the only
   record that somebody physically walked aboard, and losing one means the
   manifest says they are ashore. */
export async function gangwayFlush(
  rsvpId: string,
  atIso: string
): Promise<{ error?: string; final?: boolean }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const at = new Date(atIso);
  const stamp = Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
  const { data: landed, error } = await supabase
    .from("rsvps")
    .update({ checked_in_at: stamp, checked_in_by: staffId })
    .eq("id", rsvpId)
    .is("checked_in_at", null)
    .select("id");
  if (error) {
    /* A queued offline check-in can land against an unsigned member; the queue
       keeps it rather than silently dropping the stamp. */
    if (/boards unsigned/i.test(error.message)) {
      return { error: error.message.replace(/^.*— /, ""), final: true };
    }
    return { error: ERR_LAND };
  }

  /* Zero rows matched is not success, and it was being read as success — the
     queued stamp was deleted and nothing was said. Two ways to get here and
     they are not the same thing:

       the row is already stamped — somebody else boarded this pass, which is
       exactly the two-phones-one-pass case. The stamp is genuinely done with,
       so the queue may drop it, but the operator is told, because two people
       boarding on one code is the thing a crew needs to know about.

       the row is gone — the RSVP was cancelled or deleted while the stamp sat
       in the queue. Indeterminate: never drop it silently. */
  if (!landed || landed.length === 0) {
    const { data: row } = await supabase
      .from("rsvps")
      .select("checked_in_at")
      .eq("id", rsvpId)
      .maybeSingle();
    if (row?.checked_in_at) {
      return { error: "Already boarded on another device — that pass is aboard.", final: true };
    }
    return { error: ERR_LAND };
  }

  revalidatePath("/bridge/gangway");
  revalidatePath("/bridge/manifests");
  return {};
}
