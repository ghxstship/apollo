"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { voiceWith } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
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

/* Decline messages from one member, or allow them again. The row is the
   member's own refusal — member_blocks RLS lets a member write and delete
   only rows where blocker_id is their own id, and open_direct_thread consults
   the table on the way in, so the refusal holds server-side however the
   conversation is reopened. The other member is never notified. */
export async function setBlock(
  _prev: WordResult,
  formData: FormData
): Promise<WordResult> {
  const other = String(formData.get("other") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/gangway");
  if (!other || other === user.id) return { error: "That is you." };
  if (intent !== "block" && intent !== "unblock") {
    return { error: "That didn't land. Try again." };
  }

  /* member_blocks is this module's table and not in the shared type file yet —
     the moduleTables seam, mapped at the boundary like every other call site. */
  const db = moduleTables(supabase);
  if (intent === "block") {
    const { error } = await db
      .from("member_blocks")
      .insert({ blocker_id: user.id, blocked_id: other });
    /* 23505: the refusal is already on record — the state the member asked for. */
    if (error && error.code !== "23505") return { error: await voiceWith(supabase, error) };
  } else {
    const { error } = await db
      .from("member_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", other);
    if (error) return { error: await voiceWith(supabase, error) };
  }

  if (handle) revalidatePath(`/directory/${handle}`);
  revalidatePath("/directory");
  return {};
}
