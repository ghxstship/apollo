import { createClient } from "@/lib/supabase/server";

/* Server-action guard — defense in depth on top of RLS. Every write path
   re-verifies the operator before touching the record. */

export type ActionResult = { error?: string };

export const ERR_STAFF = "Staff only. If that's wrong, hail the shore office.";
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
