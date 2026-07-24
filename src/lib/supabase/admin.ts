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
