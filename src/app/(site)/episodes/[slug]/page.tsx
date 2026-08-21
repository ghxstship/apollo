import type { Metadata } from "next";
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
    .from("dispatch_posts")
    .select("title, dek")
    .eq("slug", slug)
    .maybeSingle();
  return {
    title: post?.title ?? "Episodes",
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
    .from("dispatch_posts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!post) notFound();

  const paragraphs = (post.body ?? "").split(/\n\n+/).filter(Boolean);

  return (
    <div className="ls-container">
      <article className="dp-art">
        <Link href="/episodes" className="ls-eyebrow" style={{ color: "var(--text-2)" }}>
          ← Episodes
        </Link>
        <div className="dp-kick" style={{ marginTop: 28 }}>
          {post.tag ? (
            <>
              <span className="tag">{post.tag}</span>
              <span>·</span>
            </>
          ) : null}
          <span>
            {logDate(post.published_at)} · {roman(new Date(post.published_at).getFullYear())}
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
          <span className="dp-art__coords">Filed from 33.98° N — 118.45° W</span>
          <Link href="/episodes">Back to the log</Link>
        </div>
      </article>
    </div>
  );
}
