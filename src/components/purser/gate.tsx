import { createClient } from "@/lib/supabase/server";
import { PurserLauncher } from "./launcher";

/* Signed-in members only on the public site — anon gets nothing. */
export async function PurserGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return <PurserLauncher />;
}
