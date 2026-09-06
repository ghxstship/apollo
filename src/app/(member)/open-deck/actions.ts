"use server";

import { revalidatePath } from "next/cache";
import { STALE_LINK_MESSAGE, voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { asText, isId } from "@/lib/arg";

export type OpenDeckResult = { error?: string };

/* Every id below names a row RLS already owns — a post the member does not
   author cannot be struck, a hail is keyed to their own id. What was missing
   is the SHAPE check: a malformed id skips the policy entirely and is answered
   by the driver, so the member reads "invalid input syntax for type uuid"
   laundered into a line about a link. Said in the club's own words instead,
   and said before the write. */
const STALE_POST = "That post is no longer on the deck.";

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
  /* Attaching an episode. The column took whatever arrived — unchecked shape,
     and unchecked against anything at all, because open_deck_posts' INSERT
     policy tests the AUTHOR and not the episode. So a post could be filed
     against an episode that has already gone, one that was called off, or a
     bare uuid naming nothing, and it then rendered in that episode's deck.

     The rule enforced here is the one the composer already offers: an episode
     that is live, or still ahead of us. That is a narrower question than
     "an episode you were on" — see the report; the composer deliberately
     offers the club's whole near calendar, and a deck you can post to only
     after you have sailed is a different product. What this closes is the gap
     between what the surface offers and what the server accepts. */
  const episodeId = String(formData.get("episode_id") ?? "").trim();
  if (episodeId) {
    if (!isId(episodeId)) return { error: STALE_LINK_MESSAGE };
    const { data: episode } = await supabase
      .from("episodes")
      .select("status, starts_at")
      .eq("id", episodeId)
      .maybeSingle();
    const open =
      episode &&
      (episode.status === "live" ||
        ((episode.status === "scheduled" || episode.status === "weather_hold") &&
          new Date(episode.starts_at).getTime() >= Date.now()));
    if (!open) {
      return { error: "That episode is not one the deck takes posts for — pick another, or post without one." };
    }
  }

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
  if (!isId(postId)) return { error: STALE_POST };
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
  if (!isId(postId)) return { error: STALE_POST };
  const text = asText(body).trim();
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
  if (!isId(postId)) return { error: STALE_POST };
  if (!FLAG_REASONS.has(reason)) return { error: "Pick a reason first." };
  const trimmed = asText(note).trim().slice(0, 500);
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
  if (!isId(postId)) return { error: STALE_POST };
  const { error } = await supabase
    .from("open_deck_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", userId);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/open-deck");
  return {};
}
