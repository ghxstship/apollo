"use server";

import { redirect } from "next/navigation";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type WordResult = { error?: string };

/* Open (or reopen) the direct thread between the viewer and another member.
   The RPC is idempotent — it returns the existing thread when there is one.

   It also refuses, in the club's own words: a membership on hold, a member who
   has left that conversation, one who is not taking messages from you, one you
   have neither sailed with nor found in the directory. Every one of those was
   thrown away by `if (error || !data) redirect("/directory")` — the member
   pressed the button, landed back on the roster, and was told nothing at all.
   The carefully-voiced strings could not reach anybody. */
export async function sendAWord(
  _prev: WordResult,
  formData: FormData
): Promise<WordResult> {
  const other = String(formData.get("other") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!other || other === user.id) return { error: "That is you." };

  const { data, error } = await supabase.rpc("open_direct_thread", { p_other: other });
  if (error) return { error: await voiceWith(supabase, error) };
  if (!data) return { error: "That didn't land. Try again." };
  redirect(`/threads/${data}`);
}
