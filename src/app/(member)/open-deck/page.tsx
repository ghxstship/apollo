import type { Metadata } from "next";
import { SURFACES } from "@/lib/brand";
import { memberMark } from "@/lib/membership";
import { getMember, type DirectoryMember } from "../data";
import { relTime } from "../relative";
import { Composer, FeedList, type FeedPost, type VoyageOption } from "./feed";
import { OpenDeckRealtime } from "./realtime";

export const metadata: Metadata = { title: SURFACES.openDeck };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

/* The deck reads the newest sixty posts, not the whole log. Before this the
   page pulled every post, every hail and every comment the club had ever
   written on each render — and realtime re-renders it on every write. */
const PAGE_SIZE = 60;

function toneOf(p: { avatar_tone?: string | null } | undefined | null): "ink" | "sea" | "gold" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "sand";
}

export default async function OpenDeckPage() {
  const { supabase, user, profile, onHold } = await getMember();
  const nowIso = new Date().toISOString();

  const [postsRes, taggableRes] = await Promise.all([
    supabase
      .from("wardroom_posts")
      .select("id,author_id,author_name,body,voyage_id,created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    /* Taggable voyages for the composer: live now, or still ahead. Filtered
       at the database rather than after reading every episode ever raised. */
    supabase
      .from("voyages")
      .select("id,title,starts_at")
      .or(`status.eq.live,and(status.in.(scheduled,weather_hold),starts_at.gte.${nowIso})`)
      .order("starts_at", { ascending: true })
      .limit(40),
  ]);

  const posts = postsRes.data ?? [];
  const postIds = posts.map((p) => p.id);
  const taggable: VoyageOption[] = (taggableRes.data ?? []).map((v) => ({ id: v.id, title: v.title }));

  /* Hails, comments and episode titles only for the posts on the page. */
  const postVoyageIds = Array.from(
    new Set(posts.map((p) => p.voyage_id).filter((id): id is string => !!id))
  );
  const [hailsRes, commentsRes, voyagesRes] = await Promise.all([
    postIds.length
      ? supabase.from("wardroom_hails").select("post_id,profile_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as Array<{ post_id: string; profile_id: string }> }),
    postIds.length
      ? supabase
          .from("wardroom_comments")
          .select("id,post_id,author_id,author_name,body")
          .in("post_id", postIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            post_id: string;
            author_id: string | null;
            author_name: string | null;
            body: string;
          }>,
        }),
    postVoyageIds.length
      ? supabase.from("voyages").select("id,title").in("id", postVoyageIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);

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
    ? await supabase
        .from("member_directory")
        .select("id,full_name,member_no,avatar_tone")
        .in("id", authorIds)
    : { data: [] as Array<Pick<DirectoryMember, "id" | "full_name" | "member_no" | "avatar_tone">> };
  const byId = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  /* League, not tier — tenure rather than spend, matching the directory. */
  const leagueRes = authorIds.length
    ? await supabase.from("member_league").select("profile_id, league_name").in("profile_id", authorIds)
    : { data: [] as Array<{ profile_id: string; league_name: string }> };
  const leagueOf = new Map(
    (leagueRes.data ?? []).map((l) => [l.profile_id, (l.league_name ?? "").split(" — ")[0]])
  );

  /* Group once rather than filtering the whole list per post. */
  const hailsByPost = new Map<string, typeof hails>();
  for (const h of hails) hailsByPost.set(h.post_id, [...(hailsByPost.get(h.post_id) ?? []), h]);
  const commentsByPost = new Map<string, typeof comments>();
  for (const c of comments) commentsByPost.set(c.post_id, [...(commentsByPost.get(c.post_id) ?? []), c]);

  const feed: FeedPost[] = posts.map((p) => {
    const author = p.author_id ? byId.get(p.author_id) : null;
    const who = author?.full_name ?? p.author_name ?? "A member";
    const meta = [
      memberMark(author?.member_no) || null,
      /* Not the paid tier. The directory deliberately shows League — tenure —
         rather than what someone spends, and this was the one surface
         broadcasting a member's plan level beside everything they wrote. */
      leagueOf.get(p.author_id ?? "")?.toUpperCase() ?? "CREW",
      relTime(p.created_at),
    ]
      .filter(Boolean)
      .join(" · ");
    const postHails = hailsByPost.get(p.id) ?? [];
    return {
      id: p.id,
      who,
      tone: toneOf(author),
      meta,
      body: p.body,
      voyageId: p.voyage_id,
      voyageTitle: p.voyage_id ? voyageTitles.get(p.voyage_id) ?? null : null,
      hails: postHails.length,
      myHail: postHails.some((h) => h.profile_id === user.id),
      mine: p.author_id === user.id,
      comments: (commentsByPost.get(p.id) ?? []).map((c) => {
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
    /* The composer and the feed were adjacent siblings with no gap while the
       feed's own children sat on 14 — so the composer's bottom border touched
       the first post's top border and the input this page exists for read as
       post zero. One column, one rhythm, and the header keeps its own tighter
       pairing inside its own box. */
    <div
      style={{
        maxWidth: 720,
        marginInline: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <OpenDeckRealtime postIds={postIds} />
      <div>
        <span className="mbr-eyebrow">Members only · mind the code</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          Open Deck.
        </h1>
      </div>
      <Composer
        authorName={profile?.full_name ?? "You"}
        tone={toneOf(profile)}
        voyages={taggable}
        onHold={onHold}
      />
      <FeedList posts={feed} />
      {posts.length === PAGE_SIZE ? (
        <p className="mbr-mono" style={{ color: "var(--text-3)" }}>
          THE {PAGE_SIZE} MOST RECENT · OLDER WORDS STAY IN THE LOG
        </p>
      ) : null}
    </div>
  );
}
