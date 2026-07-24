import type { Metadata } from "next";
import { getOperator } from "../../data";
import { ModerationClient, type FlagCard } from "./moderation-client";

export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage() {
  const { supabase } = await getOperator();

  const { data: flagsData } = await supabase
    .from("wardroom_flags")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const flags = flagsData ?? [];

  const postIds = [...new Set(flags.map((f) => f.post_id))];
  const { data: postsData } = postIds.length
    ? await supabase.from("wardroom_posts").select("*").in("id", postIds)
    : { data: [] };
  const posts = new Map((postsData ?? []).map((p) => [p.id, p]));

  const authorIds = [
    ...new Set((postsData ?? []).map((p) => p.author_id).filter((id): id is string => !!id)),
  ];
  const { data: authorsData } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no").in("id", authorIds)
    : { data: [] };
  const authors = new Map((authorsData ?? []).map((a) => [a.id, a]));

  const cards: FlagCard[] = flags
    .map((f) => {
      const post = posts.get(f.post_id);
      if (!post) return null;
      const author = post.author_id ? authors.get(post.author_id) : undefined;
      const authorName =
        author?.full_name ?? post.author_name ?? "Unknown sailor";
      const authorLine = author?.member_no ? `${authorName} · ${author.member_no}` : authorName;
      return {
        flagId: f.id,
        postId: f.post_id,
        authorId: post.author_id,
        authorName: authorLine,
        reason: f.reason,
        flaggedAt: f.created_at,
        body: post.body,
      };
    })
    .filter((c): c is FlagCard => c !== null);

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
