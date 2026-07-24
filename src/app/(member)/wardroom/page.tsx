import type { Metadata } from "next";
import { TIER_LABEL } from "@/lib/format";
import { getMember, type Profile } from "../data";
import { relTime } from "../relative";
import { Composer, PostCard, type FeedPost } from "./feed";

export const metadata: Metadata = { title: "The Wardroom" };

const TONES = new Set(["ink", "sea", "brass", "sand"]);

function toneOf(p: Profile | undefined | null): "ink" | "sea" | "brass" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "brass" | "sand") : "sand";
}

export default async function WardroomPage() {
  const { supabase, user, profile } = await getMember();

  const [postsRes, hailsRes, commentsRes, voyagesRes] = await Promise.all([
    supabase.from("wardroom_posts").select("*").order("created_at", { ascending: false }),
    supabase.from("wardroom_hails").select("*"),
    supabase.from("wardroom_comments").select("*").order("created_at", { ascending: true }),
    supabase.from("voyages").select("id,title"),
  ]);

  const posts = postsRes.data ?? [];
  const hails = hailsRes.data ?? [];
  const comments = commentsRes.data ?? [];
  const voyageTitles = new Map((voyagesRes.data ?? []).map((v) => [v.id, v.title]));

  /* Resolve author profiles in one pass. */
  const authorIds = Array.from(
    new Set(
      [...posts, ...comments]
        .map((p) => p.author_id)
        .filter((id): id is string => !!id)
    )
  );
  const profilesRes = authorIds.length
    ? await supabase.from("profiles").select("*").in("id", authorIds)
    : { data: [] as Profile[] };
  const byId = new Map<string, Profile>((profilesRes.data ?? []).map((p) => [p.id, p]));

  const feed: FeedPost[] = posts.map((p) => {
    const author = p.author_id ? byId.get(p.author_id) : null;
    const who = author?.full_name ?? p.author_name ?? "A member";
    const meta = [
      author?.member_no,
      author ? TIER_LABEL[author.tier]?.toUpperCase() : "CREW",
      relTime(p.created_at),
    ]
      .filter(Boolean)
      .join(" · ");
    const postHails = hails.filter((h) => h.post_id === p.id);
    return {
      id: p.id,
      who,
      tone: toneOf(author),
      meta,
      body: p.body,
      voyageTitle: p.voyage_id ? voyageTitles.get(p.voyage_id) ?? null : null,
      hails: postHails.length,
      myHail: postHails.some((h) => h.profile_id === user.id),
      mine: p.author_id === user.id,
      comments: comments
        .filter((c) => c.post_id === p.id)
        .map((c) => {
          const ca = c.author_id ? byId.get(c.author_id) : null;
          return {
            id: c.id,
            who: ca?.full_name ?? c.author_name ?? "A member",
            body: c.body,
          };
        }),
    };
  });

  return (
    <div style={{ maxWidth: 720, marginInline: "auto" }}>
      <span className="mbr-eyebrow">Members only · mind the code</span>
      <h1 className="mbr-h1" style={{ marginTop: 6, marginBottom: 24 }}>
        The Wardroom.
      </h1>
      <Composer
        authorName={profile?.full_name ?? "You"}
        tone={toneOf(profile)}
      />
      {feed.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
