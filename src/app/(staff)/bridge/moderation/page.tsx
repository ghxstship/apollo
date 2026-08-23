import type { Metadata } from "next";
import { getOperator } from "../../data";
import { ModerationClient, type FlagCard } from "./moderation-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage() {
  const { supabase } = await getOperator();

  const flagsRes = await supabase
    .from("wardroom_flags")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const flags = must(flagsRes);

  /* A flag now outlives the post it was about, so post_id can be null. Passing
     that straight into .in() sent the literal string "null" and Postgres
     rejected the whole query (22P02) — the error was swallowed, every card was
     dropped for want of a post, and the queue rendered EMPTY. One member
     deleting their own flagged post hid every open flag from every moderator. */
  const postIds = [
    ...new Set(flags.map((f) => f.post_id).filter((id): id is string => !!id)),
  ];
  const { data: postsData, error: postsError } = postIds.length
    ? await supabase.from("wardroom_posts").select("*").in("id", postIds)
    : { data: [], error: null };
  if (postsError) throw new Error(`the flag queue could not read its posts: ${postsError.message}`);
  const posts = new Map((postsData ?? []).map((p) => [p.id, p]));

  const authorIds = [
    ...new Set((postsData ?? []).map((p) => p.author_id).filter((id): id is string => !!id)),
  ];
  const { data: authorsData } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", authorIds)
    : { data: [] };
  const authors = new Map((authorsData ?? []).map((a) => [a.id, a]));

  /* A flag whose post is already gone still has to be resolvable — otherwise it
     sits 'open' forever with no way to clear it. */
  const cards: FlagCard[] = flags.map((f) => {
    const post = f.post_id ? posts.get(f.post_id) : undefined;
    const author = post?.author_id ? authors.get(post.author_id) : undefined;
    const authorName = author?.full_name ?? post?.author_name ?? "Unknown sailor";
    const authorLine = author?.member_no ? `${authorName} · ${author.member_no}` : authorName;
    return {
      flagId: f.id,
      postId: f.post_id,
      authorId: post?.author_id ?? null,
      authorName: post ? authorLine : "The post is already gone",
      reason: f.reason,
      flaggedAt: f.created_at,
      body: post?.body ?? "Removed before the Bridge got to it.",
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Moderation</span>
      <h1 className="hm-h1">The Open Deck queue.</h1>
      <p className="hm-lede">
        Flagged by members or the code-of-conduct filters. Remove with a reason, or leave up and
        keep eyes on — never silently.
      </p>
      <ModerationClient flags={cards} />
    </div>
  );
}
