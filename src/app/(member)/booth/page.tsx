import type { Metadata } from "next";
import { SURFACES } from "@/lib/brand";
import { TIER_LABEL } from "@/lib/format";
import { getMember, type Profile } from "../data";
import { relTime } from "../relative";
import { Composer, FeedList, type FeedPost, type VoyageOption } from "./feed";
import { OpenDeckRealtime } from "./realtime";

export const metadata: Metadata = { title: SURFACES.openDeck };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(p: Profile | undefined | null): "ink" | "sea" | "gold" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "sand";
}

export default async function OpenDeckPage() {
  const { supabase, user, profile } = await getMember();

  const [postsRes, hailsRes, commentsRes, voyagesRes] = await Promise.all([
    supabase.from("wardroom_posts").select("*").order("created_at", { ascending: false }),
    supabase.from("wardroom_hails").select("*"),
    supabase.from("wardroom_comments").select("*").order("created_at", { ascending: true }),
    supabase.from("voyages").select("id,title,status,starts_at"),
  ]);

  const posts = postsRes.data ?? [];
  const hails = hailsRes.data ?? [];
  const comments = commentsRes.data ?? [];
  const voyages = voyagesRes.data ?? [];
  const voyageTitles = new Map(voyages.map((v) => [v.id, v.title]));

  /* Taggable voyages for the composer: live now, or still ahead. */
  const nowIso = new Date().toISOString();
  const taggable: VoyageOption[] = voyages
    .filter(
      (v) =>
        v.status === "live" ||
        ((v.status === "scheduled" || v.status === "weather_hold") &&
          v.starts_at >= nowIso)
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((v) => ({ id: v.id, title: v.title }));

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
      voyageId: p.voyage_id,
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
      <OpenDeckRealtime />
      <span className="mbr-eyebrow">Members only · mind the code</span>
      <h1 className="mbr-h1" style={{ marginTop: 6, marginBottom: 24 }}>
        The Booth.
      </h1>
      <Composer
        authorName={profile?.full_name ?? "You"}
        tone={toneOf(profile)}
        voyages={taggable}
      />
      <FeedList posts={feed} />
    </div>
  );
}
