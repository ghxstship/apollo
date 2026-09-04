import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { moduleTables } from "@/lib/module-tables";
import { liveWalletToken, type WalletTokenRow } from "./facts";

export { readCardFacts } from "./facts";

/* The service-role side of the wallet token.

   A member mints their own token through issue_wallet_token(), which reads
   auth.uid(). The update path has no member on the line — it runs from a
   server function after a Bridge action — so it reads the live token directly
   and, when a member has never held one, mints one for them. Insert rather
   than RPC because the definer function has no caller to scope to, and the
   service role is the one principal the table's RLS does not apply to. */
export async function issueWalletTokenFor(admin: SupabaseClient<Database>, profileId: string): Promise<WalletTokenRow | null> {
  const live = await liveWalletToken(admin, profileId);
  if ("token" in live) return live.token;
  if ("notOpen" in live) return null;
  const { data, error } = await moduleTables(admin)
    .from("wallet_tokens")
    .insert({ profile_id: profileId })
    .select("token, profile_id, issued_at, revoked_at, touched_at")
    .single();
  if (error) return null;
  return data as WalletTokenRow;
}
