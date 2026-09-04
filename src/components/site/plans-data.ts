import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

/* The plans the shore may read — active and published, in tier order. The
   same filter the Casting grid applies, so a plan unpublished on the Bridge
   leaves the grid, the guest FAQ and the fine print in one move. Fails soft:
   no rows, no invented allowance — guestLine() has a sentence for that. */
export type PublicPlan = Tables<"membership_plans">;

export async function readPublicPlans(
  supabase?: Awaited<ReturnType<typeof createClient>>
): Promise<PublicPlan[]> {
  try {
    const client = supabase ?? (await createClient());
    const { data } = await client
      .from("membership_plans")
      .select("*")
      .eq("active", true)
      .eq("published", true)
      .order("tier", { ascending: true })
      .order("price_cents", { ascending: true });
    return data ?? [];
  } catch {
    return [];
  }
}
