"use server";

import { revalidatePath } from "next/cache";
import { CLUB_ZONE } from "@/lib/brand";
import { voice } from "@/lib/errors";
import { wallClockInZone } from "@/lib/format";
import { moduleTables } from "@/lib/module-tables";
import { BACKGROUND_STATES, type BackgroundState } from "@/lib/vetting";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* The vetting file — the club's record about a member, written only here.

   vetting_files is staff-only at the policy, had no writer anywhere in src/,
   and was empty. Four of the six gates on a member's own checklist read off it
   — ID and age verified, Background cleared, Lifestyle vetted, and (through
   guard_the_vetting) Seated this sailing — so all four were permanently OPEN
   for every member, with nothing anyone could do about it from inside the
   product.

   Three fields on this table are NOT written from here, deliberately:

   · fast_track is recomputed on every write by settle_the_vetting_file from
     the member's subscription. It is a benefit of the membership and has never
     been for sale, so there is no control for it — a crew tablet that could
     grant it would be the sale.
   · cleared_at, cleared_until and declined_at are settled by the same trigger
     from background_state. Twelve months from clearance is the rule; a screen
     that could type a different date would be a screen that could disagree
     with the line every cleared member has already read.
   · id_purge_due is recomputed by purge_spent_identity_records against the
     member's last completed sailing. Thirty days after the last sailing is the
     promise; it is arithmetic, not a decision. */

export type FilePatch = {
  idVerified: boolean;
  ageOk: boolean;
  backgroundState: BackgroundState;
  /** A wall-clock string from <input type="datetime-local">, or "" to clear. */
  interviewAt: string;
};

function done(): ActionResult {
  revalidatePath("/bridge/vetting");
  revalidatePath("/vetting");
  return {};
}

function isState(v: string): v is BackgroundState {
  return (BACKGROUND_STATES as readonly string[]).includes(v);
}

/* Opening a file is the first gate and it is a separate act from advancing one:
   an open file with nothing decided is a real state — "SUBMITTED · with the
   vetting team, 48 hours" — and it is what the member's page reads to stop
   saying nothing is happening. */
export async function openTheFile(profileId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  if (!profileId) return { error: "Pick a member first." };

  /* One file per member is a partial unique index on the table, so a second
     insert is refused at the database and this is only the friendlier of the
     two answers. */
  const { data: existing, error: readError } = await db
    .from("vetting_files")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (readError) return { error: voice(readError) };
  if (existing) return { error: "That member already has a file open." };

  const { error } = await db.from("vetting_files").insert({
    profile_id: profileId,
    background_state: "submitted",
  });
  if (error) return { error: voice(error) };
  return done();
}

export async function advanceTheFile(fileId: string, patch: FilePatch): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  if (!isState(patch.backgroundState)) return { error: "That is not a vetting state." };

  /* NEEDS A CALL is the only state whose copy names a next step the member has
     to be able to keep — "a 10-minute video interview finishes it". Moving a
     file there without a time on it tells them to wait for a call that nobody
     has booked. */
  if (patch.backgroundState === "needs_a_call" && !patch.interviewAt) {
    return { error: "A call needs a time on it — the member is told an interview finishes their clearance." };
  }

  /* <input type="datetime-local"> yields "2026-09-01T14:30" with NO OFFSET, so
     `new Date()` would resolve it in the NODE SERVER'S zone — on a UTC host
     that books a 14:30 call for 10:30 Eastern. A vetting file has no harbour to
     borrow a clock from, so it is read on the club's, which is the same zone
     guard_the_vetting prints a lapsed clearance in. */
  let interviewAt: string | null = null;
  if (patch.interviewAt) {
    const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(patch.interviewAt);
    if (!local) return { error: "That interview time doesn't parse." };
    const when = new Date(
      wallClockInZone(
        Number(local[1]), Number(local[2]), Number(local[3]),
        Number(local[4]), Number(local[5]),
        CLUB_ZONE
      )
    );
    if (Number.isNaN(when.getTime())) return { error: "That interview time doesn't parse." };
    interviewAt = when.toISOString();
  }

  const { error } = await db
    .from("vetting_files")
    .update({
      /* The record is a timestamp, not a flag: the purge sweep clears the
         timestamp thirty days after the member's last sailing, and a boolean
         would have nothing to clear. */
      id_verified_at: patch.idVerified ? new Date().toISOString() : null,
      age_ok: patch.ageOk,
      background_state: patch.backgroundState,
      interview_at: interviewAt,
    })
    .eq("id", fileId);
  if (error) return { error: voice(error) };
  return done();
}

/* The identity record's own clock. purge_spent_identity_records recomputes
   every due date from the member's last completed sailing and then clears
   anything past due — idempotent, and correct whether it runs on a schedule or
   never. It had no caller either; this is the crew's hand on it. */
export async function sweepSpentIdentityRecords(): Promise<ActionResult & { swept?: number }> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { data, error } = await moduleTables(supabase).rpc("purge_spent_identity_records");
  if (error) return { error: voice(error) };
  revalidatePath("/bridge/vetting");
  revalidatePath("/vetting");
  return { swept: typeof data === "number" ? data : 0 };
}
