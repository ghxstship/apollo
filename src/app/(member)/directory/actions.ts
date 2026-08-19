"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/* Open (or reopen) the direct thread between the viewer and another member.
   The RPC is idempotent — it returns the existing thread when there is one. */
export async function sendAWord(formData: FormData): Promise<void> {
  const other = String(formData.get("other") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!other || other === user.id) redirect("/directory");

  const { data, error } = await supabase.rpc("open_direct_thread", { p_other: other });
  if (error || !data) redirect("/directory");
  redirect(`/threads/${data}`);
}
