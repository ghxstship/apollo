import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/* Service-role client — bypasses RLS. Webhook and trusted server work only;
   never import from anything that reaches the client bundle. */

/* Whether this deployment has a service key at all.
 *
 * createAdminClient() throws "supabaseKey is required" when the variable is
 * missing, and a throw inside a route handler is a 500 with a stack. The MCP
 * layer worked this out already and says it in terms — "an unconfigured
 * deployment fails closed, not open and not loud" — but it kept the answer to
 * itself, so every route written afterwards had to rediscover it. Two written
 * on 2026-09-06 did not: /api/unsubscribe and /api/recover both 500'd on a
 * deployment with no key, and both are reachable with no session at all.
 *
 * Asked before the client is built, so a caller gets a sentence and a
 * Retry-After instead of a stack. */
export function serviceRoleReady(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/* An anonymous client that holds no session and writes no cookie. Its one use
   is proving somebody knows a password without signing them in again: calling
   signInWithPassword on the request's own client would mint a new session and
   rewrite the cookies mid-action, which is a lot of moving parts for a check
   whose answer we throw away. This one mints a token nobody keeps.

   Not the service role. Verifying a password must go through the front door,
   because the front door is what counts failures and applies the provider's own
   throttling. */
export function createVerifierClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}
