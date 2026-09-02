import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logDate, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("log_posts")
    .select("title, dek")
    .eq("slug", slug)
    .maybeSingle();
  return {
    alternates: { canonical: `/log/${slug}` },
    title: post?.title ?? "The Log",
    description: post?.dek ?? undefined,
  };
}

export default async function LoreArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("log_posts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!post) notFound();

  const paragraphs = (post.body ?? "").split(/\n\n+/).filter(Boolean);

  return (
    <div className="ls-container">
      <article className="dp-art">
        <Link href="/log" className="ls-eyebrow" style={{ color: "var(--text-2)" }}>
          ← The Log
        </Link>
        <div className="dp-kick" style={{ marginTop: 28 }}>
          {post.tag ? (
            <>
              <span className="tag">{post.tag}</span>
              <span>·</span>
            </>
          ) : null}
          <span>
            {logDate(post.published_at, CLUB_ZONE)} · {roman(new Date(post.published_at).getFullYear())}
          </span>
        </div>
        <h1>{post.title}</h1>
        {post.dek ? <p className="dp-art__dek">{post.dek}</p> : null}
        <div className="dp-art__body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="dp-art__foot">
          {/* Was 33.98° N — 118.45° W, Marina del Rey, on every article the Log
              has ever published. log_posts carries no episode_id and no
              city_id, so there is nothing on the row to read a real position
              off — the honest fallback is the club's home city, and this is
              Miami's coordinate exactly as the cities table holds it. Give a
              post an episode and this line should read that episode's position
              instead. */}
          <span className="dp-art__coords">Filed from 25.7617° N — 80.1918° W</span>
          <Link href="/log">Back to the log</Link>
        </div>
      </article>
    </div>
  );
}
