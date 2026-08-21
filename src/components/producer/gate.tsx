import { createClient } from "@/lib/supabase/server";
import { ProducerLauncher } from "./launcher";

/* Signed-in members only on the public site — anon gets nothing. */
export async function ProducerGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return <ProducerLauncher />;
}
