"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type OpenDeckResult = { error?: string };

async function member() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function createPost(
  _prev: OpenDeckResult,
  formData: FormData
): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Say something first." };
  if (body.length > 2000) return { error: "Keep it under 2,000 characters." };
  const episodeId = String(formData.get("episode_id") ?? "").trim();
  const { error } = await supabase
    .from("open_deck_posts")
    .insert({ author_id: userId, body, episode_id: episodeId || null });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/open-deck");
  return {};
}

export async function toggleHail(postId: string, hailed: boolean): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = hailed
    ? await supabase
        .from("open_deck_hails")
        .delete()
        .eq("post_id", postId)
        .eq("profile_id", userId)
    : await supabase
        .from("open_deck_hails")
        .insert({ post_id: postId, profile_id: userId });
  /* A duplicate hail is a stale render's double-click, not a failure — the PK
     already holds the fact. Voicing 23505 here told the member "check the
     numbers" about a button with no numbers on it. */
  if (error && error.code === "23505") {
    revalidatePath("/open-deck");
    return {};
  }
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/open-deck");
  return {};
}

export async function addComment(postId: string, body: string): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const text = body.trim();
  if (!text) return { error: "Say something first." };
  if (text.length > 1000) return { error: "Keep it under 1,000 characters." };
  const { error } = await supabase
    .from("open_deck_comments")
    .insert({ post_id: postId, author_id: userId, body: text });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/open-deck");
  return {};
}

const FLAG_REASONS = new Set(["resale", "heated", "conduct", "other"]);

export async function flagPost(
  postId: string,
  reason: string,
  note: string
): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  if (!FLAG_REASONS.has(reason)) return { error: "Pick a reason first." };
  const trimmed = note.trim().slice(0, 500);
  const { error } = await supabase.from("open_deck_flags").insert({
    post_id: postId,
    flagger_id: userId,
    reason: trimmed ? `${reason} — ${trimmed}` : reason,
  });
  if (error) return { error: await voiceWith(supabase, error) };
  return {};
}

export async function deletePost(postId: string): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("open_deck_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", userId);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/open-deck");
  return {};
}
