import { createClient } from "@/lib/supabase/server";

/* Server-action guard — defense in depth on top of RLS. Every write path
   re-verifies the operator before touching the record. */

export type ActionResult = { error?: string };

export const ERR_STAFF = "Staff only. If that's wrong, hail Shoreside.";
export const ERR_LAND = "That didn't land. Try again.";

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
export function boardingError(error: { message?: string | null } | null): string {
  const message = error?.message ?? "";
  if (/boards unsigned/i.test(message)) {
    return `${message.replace(/^.*— /, "")} — send them the link to sign, then scan again.`;
  }
  return ERR_LAND;
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
