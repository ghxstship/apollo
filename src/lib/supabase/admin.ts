import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/* Service-role client — bypasses RLS. Webhook and trusted server work only;
   never import from anything that reaches the client bundle. */

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
