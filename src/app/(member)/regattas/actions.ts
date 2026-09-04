"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type ContestResult = { error?: string };

/* The slug is only ever a cache key here, but it comes off the wire and goes
   into revalidatePath — so it has the shape a contest slug has, or it is
   nothing. */
const SLUG = /^[a-z0-9-]{1,80}$/;

/* Entering and leaving a contest. Both are plain table writes — the RLS policies
   are the whole rule set: you may only enter yourself, only into an open contest,
   only before it closes, and, when the contest is scoped to one episode, only if
   you hold an aboard pass on it. Nothing here needs to be trusted.

   What a policy cannot do is speak. Both of these threw the result on the floor
   and redirected to the page the member was already on, so a refusal looked
   exactly like a success that had not rendered yet: press Enter, come back to
   the same page, no entry, no reason, nothing to do next. The write's answer is
   carried back now and the control renders it. */

export async function enterContest(
  _prev: ContestResult,
  formData: FormData
): Promise<ContestResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const contestId = String(formData.get("contest") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!contestId || !SLUG.test(slug)) redirect("/regattas");

  const { error } = await supabase
    .from("contest_entries")
    .insert({ contest_id: contestId, profile_id: user.id });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath(`/regattas/${slug}`);
  revalidatePath("/regattas");
  return {};
}

export async function withdrawFromContest(
  _prev: ContestResult,
  formData: FormData
): Promise<ContestResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const contestId = String(formData.get("contest") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!contestId || !SLUG.test(slug)) redirect("/regattas");

  const { error } = await supabase
    .from("contest_entries")
    .delete()
    .eq("contest_id", contestId)
    .eq("profile_id", user.id);
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath(`/regattas/${slug}`);
  revalidatePath("/regattas");
  return {};
}
