"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ThreadResult = { error?: string };

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/* Stamp the read line. Called when a conversation opens and after each
   realtime arrival, so the inbox dot and the nav badge stay honest. */
export async function markThreadRead(threadId: string): Promise<void> {
  const { supabase, userId } = await member();
  if (!userId || !threadId) return;
  await supabase
    .from("thread_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("profile_id", userId);
  revalidatePath("/threads");
}

export async function sendMessage(
  _prev: ThreadResult,
  formData: FormData
): Promise<ThreadResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };

  const threadId = String(formData.get("thread_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!threadId) return { error: "That thread has drifted off. Try again." };
  if (!body) return { error: "Say something first." };
  if (body.length > 4000) return { error: "Keep it under 4,000 characters." };

  const { data: thread } = await supabase
    .from("threads")
    .select("closed_at")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return { error: "That thread has drifted off. Try again." };
  if (thread.closed_at) return { error: "This thread closed after the debrief." };

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, author_id: userId, body });
  if (error) return { error: "That didn't land. Try again." };

  /* Your own word is never unread to you. */
  await supabase
    .from("thread_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("profile_id", userId);

  revalidatePath(`/threads/${threadId}`);
  revalidatePath("/threads");
  return {};
}
