"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
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
  const voyageId = String(formData.get("voyage_id") ?? "").trim();
  const { error } = await supabase
    .from("wardroom_posts")
    .insert({ author_id: userId, body, voyage_id: voyageId || null });
  if (error) return { error: voice(error) };
  revalidatePath("/open-deck");
  return {};
}

export async function toggleHail(postId: string, hailed: boolean): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = hailed
    ? await supabase
        .from("wardroom_hails")
        .delete()
        .eq("post_id", postId)
        .eq("profile_id", userId)
    : await supabase
        .from("wardroom_hails")
        .insert({ post_id: postId, profile_id: userId });
  if (error) return { error: voice(error) };
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
    .from("wardroom_comments")
    .insert({ post_id: postId, author_id: userId, body: text });
  if (error) return { error: voice(error) };
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
  const { error } = await supabase.from("wardroom_flags").insert({
    post_id: postId,
    flagger_id: userId,
    reason: trimmed ? `${reason} — ${trimmed}` : reason,
  });
  if (error) return { error: voice(error) };
  return {};
}

export async function deletePost(postId: string): Promise<OpenDeckResult> {
  const { supabase, userId } = await member();
  if (!userId) return { error: "Sign in first." };
  const { error } = await supabase
    .from("wardroom_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", userId);
  if (error) return { error: voice(error) };
  revalidatePath("/open-deck");
  return {};
}
