import { createClient } from "@/lib/supabase/server";

/* Server-action guard — defense in depth on top of RLS. Every write path
   re-verifies the operator before touching the record. */

/* `note` is not an error. It carries something the operator must know but that
   did not stop the action — people released from a line, or a standing change
   whose dues call did not land. Kept separate so a screen cannot render it in
   the failure colour. */
export type ActionResult = { error?: string; note?: string };

/* Defined in @/lib/staff-errors so client screens can recognise them without
   importing this module, which reaches for the server client. Imported and
   re-exported here because every existing caller expects them from this file. */
import { ERR_STAFF, ERR_LAND } from "@/lib/staff-errors";
import { isRlsRefusal, voice } from "@/lib/errors";
export { ERR_STAFF, ERR_LAND };

export async function staffContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, staffId: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, staffId: profile?.is_staff ? user.id : (null as string | null) };
}

/* The waiver gate refuses at the database, in the club's own voice ("… boards
   unsigned"). Hand the skipper the reason and the fix rather than a generic
   failure — it is thirty seconds on the member's own phone.

   This lived inline in the Gangway's two actions and nowhere else, so the
   Manifests screen's Check in button — which is the one an operator reaches
   for most, and which happily offers itself on a row badged WAIVER MISSING —
   answered "That didn't land. Try again." and left them with nowhere to go. */
export function boardingError(error: { message?: string | null; code?: string | null } | null): string {
  const message = error?.message ?? "";
  if (/boards unsigned/i.test(message)) {
    return `${message.replace(/^.*— /, "")} — send them the link to sign, then scan again.`;
  }
  /* A policy refusal at the gangway means the hand on the scanner is neither
     staff nor tonight's door. That is a fact about the operator, not the pass. */
  if (isRlsRefusal(error)) return ERR_STAFF;
  /* Everything else the guards raise is already in the club's voice and is a
     real answer about the pass — "no seat has come free for this standby
     pass", "a boarding code is issued by the club", the ratio's "10 seats, 10
     taken". This used to flatten all of it to ERR_LAND, so a standby pass
     scanned before a seat came free met "That didn't land. Try again." and
     the operator tried again, and again. voice() hands the words on with a
     capital and a full stop, and flattens only what is the schema talking to
     itself; with no error at all it says ERR_LAND, as before. */
  return voice(error);
}

/* Every Bridge screen read its rows as `res.data ?? []`, so a query that
   failed rendered an empty list. "Nothing to do" and "this broke" looked
   identical, and the operator had no way to tell them apart — which is how the
   whole moderation queue once sat empty behind a swallowed 22P02, and how the
   push counter read 0 pending while fourteen were waiting.

   A read that fails is not an empty list. Throw, and let the error boundary
   say so. */
export function must<T>(res: { data: T[] | null; error?: { message?: string } | null }): T[] {
  if (res.error) {
    throw new Error(`the Bridge could not read its rows: ${res.error.message ?? "unknown"}`);
  }
  return res.data ?? [];
}

/* The RPC twin of must(). The Reports and Documents screens moved their counts
   onto definer RPCs to escape PostgREST's 1000-row cap — and then read the
   results with `?? 0`, which is the very failure must() exists to end: an RPC
   error would render 0 weather notices and 0 across all nine outbox figures,
   silently, which is exactly "the push counter read 0 pending while fourteen
   were waiting". */
export function mustValue<T>(res: { data: T | null; error?: { message?: string } | null }, fallback: T): T {
  if (res.error) {
    throw new Error(`the Bridge could not read its rows: ${res.error.message ?? "unknown"}`);
  }
  return res.data ?? fallback;
}
