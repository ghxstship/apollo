import type { SupabaseClient } from "@supabase/supabase-js";

/* Reach for tables this module added, without editing the shared type file.

   `src/lib/supabase/types.ts` is hand-maintained and mirrors the migrations,
   which works exactly as long as one person is adding tables. Three modules are
   adding tables to this schema in the same week; a hand-merge of one 900-line
   declaration file, three ways, is how one module's row types quietly disappear
   and the build stays green because the OTHER module's types still compile.

   So the shared file is left alone and each module declares its own row shapes
   beside the code that reads them. This helper is the one seam: it drops the
   `Database` generic so `.from()` will accept a table name the shared file has
   never heard of, and every call site maps the untyped result into a declared
   interface immediately. The rows are typed where it matters — at the boundary
   the reader can see — rather than in a file nobody in this change owns.

   When the three modules land, the row shapes move into types.ts in one pass
   and this file is deleted. It is a merge strategy, not an architecture. */
export function moduleTables(supabase: unknown): SupabaseClient {
  return supabase as SupabaseClient;
}
