"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { voiceWith } from "@/lib/errors";

/* — An enquiry for an on-request format.

   A private charter, a member gathering with the club's own crew: formats
   whose access is 'on_request' have no pass to confirm — rsvp_guard refuses
   the booking outright — so the door is a request the Bridge answers. The
   member inserts their own charter_requests row (RLS: own profile, active,
   status submitted); the ruling comes back as a word.

   Refusals name the way out. A paused membership is the common one and
   voiceWith says so, with the page that has the way back. — */

export type CharterRequestState = { raised?: boolean; error?: string; field?: "party" | "dates" | "note" };

/* The table's own limits, restated for the message rather than trusted from
   the client: the check constraints are the ones that cannot drift. */
const PARTY_MIN = 1;
const PARTY_MAX = 96;
const DATES_MAX = 200;
const NOTE_MAX = 2000;

export async function raiseCharterRequest(
  _prev: CharterRequestState,
  formData: FormData
): Promise<CharterRequestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first — members enquire from their manifest." };

  const format = String(formData.get("format") ?? "").trim();
  const sailing = String(formData.get("sailing") ?? "").trim().slice(0, 120);
  const partyRaw = String(formData.get("party_size") ?? "").trim();
  const preferredDates = String(formData.get("preferred_dates") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();

  let partySize: number | null = null;
  if (partyRaw) {
    const n = Number(partyRaw);
    if (!Number.isInteger(n) || n < PARTY_MIN || n > PARTY_MAX) {
      return { error: `A party is ${PARTY_MIN} to ${PARTY_MAX} — say how many.`, field: "party" };
    }
    partySize = n;
  }
  if (preferredDates.length > DATES_MAX) {
    return { error: `Keep the dates under ${DATES_MAX} characters.`, field: "dates" };
  }
  /* The episode the enquiry was raised from rides at the head of the note —
     the table keeps no voyage column, and the Bridge should not have to guess
     which episode page the member was reading. */
  const note = [sailing ? `Re: ${sailing}` : null, noteRaw || null].filter(Boolean).join("\n\n");
  if (note.length > NOTE_MAX) {
    return { error: `Keep the note under ${NOTE_MAX} characters.`, field: "note" };
  }

  const { error } = await supabase.from("charter_requests").insert({
    profile_id: user.id,
    format: format || null,
    party_size: partySize,
    preferred_dates: preferredDates || null,
    note: note || null,
  });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/passes");
  return { raised: true };
}
