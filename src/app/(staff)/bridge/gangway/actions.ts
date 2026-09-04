"use server";

import { revalidatePath } from "next/cache";
import type { PassRow } from "@/lib/supabase/types";
import { literalCode } from "@/lib/boarding-code";
import { createClient } from "@/lib/supabase/server";
import { ERR_LAND, boardingError } from "../../staff";
import { ERR_DOOR, STANDBY_REFUSED, isStandbyRefusal } from "./door-errors";
import { logDateYear } from "@/lib/format";
import { memberMark } from "@/lib/membership";

/* Who may work this door. Staff, and the holder of a live door grant — the
   hired crew member who has the gangway for one episode and nothing else.
   is_door() is SECURITY DEFINER and answers for both, so one round trip
   admits the caller; is_door(episode) is asked again, on the pass actually
   found, before anything is stamped — the caller's grant may be for tonight's
   other episode, and the kiosk calls with a placeholder episode on purpose.

   RLS is the real gate (the door reads and stamps only its own episode's
   passes); this is the door, so the refusal arrives in words rather than as
   an empty result. */
async function doorContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, doorId: null as string | null };
  const { data: door } = await supabase.rpc("is_door");
  return { supabase, doorId: door === true ? user.id : (null as string | null) };
}

async function mayStamp(supabase: Awaited<ReturnType<typeof createClient>>, episodeId: string) {
  const { data } = await supabase.rpc("is_door", { p_episode: episodeId });
  return data === true;
}

/* The standby guard speaks first; everything else is the waiver gate's or
   the generic refusal, exactly as boardingError() already says them. */
function stampError(error: { message?: string | null } | null): string {
  if (isStandbyRefusal(error?.message)) return STANDBY_REFUSED;
  return boardingError(error);
}

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
  /* Set when the code matched a different upcoming episode than the one
     selected — the panel says which. */
  otherEpisode?: string;
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


function upcomingCutoff(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

export async function gangwayCheckIn(rawCode: string, episodeId: string): Promise<ScanResult> {
  const { supabase, doorId } = await doorContext();
  if (!doorId) return { error: ERR_DOOR };
  const staffId = doorId;

  /* A wallet pass carries a URL with a durable token rather than a boarding
     code. verify_wallet_token answers aboard / hold / void, the same three
     words as the rotating card; the pass it boards is the member's own on
     this episode. */
  const walletToken =
    rawCode.match(/\/w\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] ??
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCode.trim()) ? rawCode.trim() : null);
  let walletPass: PassRow | null = null;
  if (walletToken) {
    const { data: verdict } = await supabase.rpc("verify_wallet_token", { p_token: walletToken });
    const v = verdict?.[0];
    if (!v || v.state === "void") {
      return { error: "That wallet pass is void — the member can add a fresh one from their card." };
    }
    if (v.state === "hold") {
      return { error: `${v.full_name ?? "That member"}'s membership is on hold — no boarding.` };
    }
    const { data: own } = await supabase
      .from("passes")
      .select("*")
      .eq("episode_id", episodeId)
      .eq("profile_id", v.profile_id ?? "")
      .eq("status", "aboard")
      .maybeSingle();
    if (!own) return { error: `${v.full_name ?? "That member"} holds no pass on this episode.` };
    walletPass = own;
  }

  const code = walletToken ? "" : literalCode(rawCode);
  if (!walletToken && !code) return { error: "Type or scan a code first." };

  /* Selected episode first; fall back to any upcoming episode. */
  let rsvp: PassRow | null = walletPass;
  if (!rsvp) {
    const { data: found } = await supabase
      .from("passes")
      .select("*")
      .eq("episode_id", episodeId)
      .eq("boarding_code", code)
      .neq("status", "not_going")
      .maybeSingle();
    rsvp = found;
  }

  let otherEpisode: string | undefined;
  if (!rsvp) {
    const { data: upcoming } = await supabase
      .from("episodes")
      .select("id, title")
      .gte("starts_at", upcomingCutoff())
      .in("status", UPCOMING_STATUSES);
    const ids = (upcoming ?? []).map((v) => v.id).filter((id) => id !== episodeId);
    if (ids.length) {
      const { data: fallback } = await supabase
        .from("passes")
        .select("*")
        .in("episode_id", ids)
        .eq("boarding_code", code)
        .neq("status", "not_going")
        .maybeSingle();
      if (fallback) {
        rsvp = fallback;
        otherEpisode = (upcoming ?? []).find((v) => v.id === fallback.episode_id)?.title;
      }
    }
  }

  /* A guest stub carries its own code (…-G1) and its own signature gate. The
     scanner could only ever resolve passes.boarding_code, so every guest stub
     the product issues — printed on the host's manifest, rendered as a QR, and
     captioned "Present at the gangway" — came back as "No pass under that
     code", and the guest waiver gate (a trigger on pass_guests.checked_in_at)
     never fired because nothing in the product ever wrote that column. */
  if (!rsvp) {
    const { data: guest } = await supabase
      .from("pass_guests")
      .select("*")
      .eq("boarding_code", code)
      .maybeSingle();

    /* SCOPE THE GUEST TO ITS EPISODE. The member path above searches the
       selected episode and then only episodes still ahead, so a pass for an
       episode that has gone is refused by name. The guest path looked a stub up
       by code alone — so a guest stub for an episode that departed weeks ago
       still boarded at today's gangway and stamped checked_in_at, the column
       the guest waiver gate hangs off. A guest is admitted to an episode, not
       to the dock in general. */
    if (guest) {
      const { data: host } = await supabase
        .from("passes")
        .select("episode_id")
        .eq("id", guest.rsvp_id)
        .maybeSingle();
      const { data: gv } = host
        ? await supabase
            .from("episodes")
            .select("title, starts_at, time_zone, status")
            .eq("id", host.episode_id)
            .maybeSingle()
        : { data: null };
      const sailed =
        !gv ||
        !UPCOMING_STATUSES.includes(gv.status as (typeof UPCOMING_STATUSES)[number]) ||
        /* Compared as INSTANTS, not as strings. This read
           `gv.starts_at < upcomingCutoff()` — a lexicographic comparison of
           PostgREST's "…+00:00" against toISOString()'s "…Z" form. Correct only
           for as long as PostgREST renders UTC; the day it renders any other
           offset, the string order stops matching the time order and this fails
           OPEN — boarding a guest for an episode that has already gone. The
           member path does the same test in SQL and cannot drift this way. */
        new Date(gv.starts_at).getTime() < new Date(upcomingCutoff()).getTime();
      if (sailed) {
        return gv
          ? { error: `That guest pass is for ${gv.title}, which sailed on ${logDateYear(gv.starts_at, gv.time_zone)}.` }
          : { outcome: "not_found" as const };
      }
    }

    if (!guest) {
      /* Before calling it a forgery: the fallback above only searches episodes
         still ahead, so a pass for an episode that has already gone came back
         as "No pass matches that code on this episode." The skipper is standing
         in front of somebody holding a real pass and being told it is not real.
         Look it up unscoped and say which episode it was for. */
      const { data: old } = await supabase
        .from("passes")
        .select("episode_id")
        .eq("boarding_code", code)
        .maybeSingle();
      if (old) {
        const { data: v } = await supabase
          .from("episodes")
          .select("title, starts_at, time_zone, status")
          .eq("id", old.episode_id)
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

    const { data: guestPass } = await supabase
      .from("passes")
      .select("*")
      .eq("id", guest.rsvp_id)
      .maybeSingle();

    /* The guest rides on the host's pass: no pass, no boarding. Without this
       the scanner walked aboard a guest whose host had already released. */
    if (!guestPass || guestPass.status !== "aboard") {
      return { error: "That guest's host is not aboard — no pass, no boarding." };
    }

    const { data: host } = guestPass
      ? await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", guestPass.profile_id)
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

    /* The guest rides on the host's pass, so the door that stamps the guest
       must hold the host's episode. */
    if (!(await mayStamp(supabase, guestPass.episode_id))) return { error: ERR_DOOR };

    const guestAt = new Date().toISOString();
    const { error: guestError } = await supabase
      .from("pass_guests")
      .update({ checked_in_at: guestAt, checked_in_by: staffId })
      .eq("id", guest.id);

    if (guestError) return { error: stampError(guestError) };

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
    memberNo: memberMark(profile?.member_no) || "GUEST",
    vessel: vesselName,
    guestNames: rsvp.guest_names ?? [],
    otherEpisode,
  };

  if (rsvp.checked_in_at) return { ...base, outcome: "already", checkedInAt: rsvp.checked_in_at };

  /* The pass may sit on an episode other than the one selected — the fallback
     above searches the whole board. A door grant is for one episode; ask about
     the one the pass is actually on. */
  if (!(await mayStamp(supabase, rsvp.episode_id))) return { error: ERR_DOOR };

  /* Read-then-write: two scanners on the same code both read null and both
     wrote, so the second overwrote the first's time and operator — and that
     pair is the audit record for an incident. Narrowed on the prior state, so
     only one stamp lands and the other learns it was second. gangwayFlush has
     done this since it was written; this path had not. */
  const checkedInAt = new Date().toISOString();
  const { data: stamped, error } = await supabase
    .from("passes")
    .update({ checked_in_at: checkedInAt, checked_in_by: staffId })
    .eq("id", rsvp.id)
    .is("checked_in_at", null)
    .select("checked_in_at");
  if (error) return { error: stampError(error) };
  if (!stamped || stamped.length === 0) {
    /* Somebody stamped it between our read and our write. Not our stamp, and
       not a failure — the person is aboard. */
    const { data: fresh } = await supabase
      .from("passes")
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
  passId: string,
  atIso: string
): Promise<{ error?: string; final?: boolean }> {
  const { supabase, doorId } = await doorContext();
  if (!doorId) return { error: ERR_DOOR };
  const staffId = doorId;

  /* Which episode this stamp is for, so the door can be asked about it. A
     door whose grant has run out since the stamp was queued gets the same
     answer as no door at all — and the stamp STAYS queued: it is not a fact
     about the pass, and another device may still land it. */
  const { data: queuedPass } = await supabase
    .from("passes")
    .select("episode_id")
    .eq("id", passId)
    .maybeSingle();
  if (queuedPass && !(await mayStamp(supabase, queuedPass.episode_id))) return { error: ERR_DOOR };

  const at = new Date(atIso);
  const stamp = Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
  const { data: landed, error } = await supabase
    .from("passes")
    .update({ checked_in_at: stamp, checked_in_by: staffId })
    .eq("id", passId)
    .is("checked_in_at", null)
    .select("id");
  if (error) {
    /* A queued offline check-in can land against an unsigned member; the queue
       keeps it rather than silently dropping the stamp. */
    if (/boards unsigned/i.test(error.message)) {
      return { error: error.message.replace(/^.*— /, ""), final: true };
    }
    /* A standby pass queued with no signal, and no seat free when the signal
       came back. Final, and said in the door's voice: the person was let
       through on a cached list that could not know, and the crew needs to hear
       that now, not watch the queue retry it every minute. */
    if (isStandbyRefusal(error.message)) {
      return { error: STANDBY_REFUSED, final: true };
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
      .from("passes")
      .select("checked_in_at")
      .eq("id", passId)
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
