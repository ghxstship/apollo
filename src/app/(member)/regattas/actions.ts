"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/* Entering and leaving a contest. Both are plain table writes — the RLS policies
   are the whole rule set: you may only enter yourself, only into an open contest,
   and only before it closes. Nothing here needs to be trusted. */

export async function enterContest(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const contestId = String(formData.get("contest") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!contestId || !slug) redirect("/regattas");

  await supabase
    .from("contest_entries")
    .insert({ contest_id: contestId, profile_id: user.id });

  revalidatePath(`/regattas/${slug}`);
  redirect(`/regattas/${slug}`);
}

export async function withdrawFromContest(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const contestId = String(formData.get("contest") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!contestId || !slug) redirect("/regattas");

  await supabase
    .from("contest_entries")
    .delete()
    .eq("contest_id", contestId)
    .eq("profile_id", user.id);

  revalidatePath(`/regattas/${slug}`);
  redirect(`/regattas/${slug}`);
}
