import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Icon, StateBlock } from "@/components/ds";
import { FAMILY_LABEL } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getMember, type Profile } from "../../data";
import { Composer, ThreadLive } from "./live";

export const metadata: Metadata = { title: "Thread" };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(p: Profile | undefined | null): "ink" | "sea" | "gold" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "sand";
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await getMember();

  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
  if (!thread) notFound();

  const { data: roster } = await supabase
    .from("thread_members")
    .select("profile_id")
    .eq("thread_id", thread.id);
  if (!(roster ?? []).some((r) => r.profile_id === user.id)) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  const peopleIds = Array.from(
    new Set([
      ...(roster ?? []).map((r) => r.profile_id),
      ...(messages ?? []).map((m) => m.author_id).filter((a): a is string => !!a),
    ])
  );
  const [peopleRes, voyageRes] = await Promise.all([
    peopleIds.length
      ? supabase.from("profiles").select("*").in("id", peopleIds)
      : Promise.resolve({ data: null }),
    thread.voyage_id
      ? supabase
          .from("voyages")
          .select("id,title,class,starts_at")
          .eq("id", thread.voyage_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const peopleById = new Map<string, Profile>((peopleRes.data ?? []).map((p) => [p.id, p]));
  const voyage = voyageRes.data;

  const others = (roster ?? [])
    .filter((r) => r.profile_id !== user.id)
    .map((r) => peopleById.get(r.profile_id))
    .filter((p): p is Profile => !!p);

  const title =
    thread.kind === "crew"
      ? `${voyage?.title ?? thread.title ?? "A voyage"} — crew`
      : thread.kind === "direct"
        ? others[0]?.full_name ?? "A member"
        : thread.title ?? "Shoreside";
  const eyebrow =
    thread.kind === "crew"
      ? FAMILY_LABEL[voyage?.class ?? "sea"] ?? "Sea Day"
      : thread.kind === "direct"
        ? "Direct"
        : "Shoreside";

  const names = others.map((p) => p.full_name ?? "A member");
  const aboard =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;

  const otherHandle = thread.kind === "direct" ? others[0]?.handle ?? null : null;

  return (
    <div style={{ maxWidth: 720, marginInline: "auto" }}>
      <ThreadLive threadId={thread.id} />

      <Link href="/threads" className="dir-back mbr-mono">
        <Icon name="ArrowLeft" size={12} /> Threads
      </Link>

      <header className="thr-head">
        <span className="mbr-eyebrow">{eyebrow}</span>
        <h1 className="mbr-h1" style={{ marginTop: 6 }}>
          {title}
        </h1>
        {thread.kind === "crew" && names.length ? (
          <p className="thr-head__roster">Aboard: {aboard}</p>
        ) : null}
        {otherHandle ? (
          <p className="thr-head__roster">
            <Link href={`/directory/${otherHandle}`} className="thr-head__link">
              @{otherHandle}
            </Link>
          </p>
        ) : null}
        {thread.closed_at ? (
          <p className="mbr-mono thr-closed">Closed after the debrief</p>
        ) : null}
      </header>

      {(messages ?? []).length === 0 ? (
        <StateBlock
          status="empty"
          icon="MessageCircle"
          bare
          title="Quiet water."
          detail="Nobody has said anything yet. You could be first."
        />
      ) : (
        <div className="thr-msgs">
          {(messages ?? []).map((m) => {
            const author = m.author_id ? peopleById.get(m.author_id) : null;
            const own = m.author_id === user.id;
            return (
              <div
                key={m.id}
                className={["thr-msg", own ? "thr-msg--own" : ""].filter(Boolean).join(" ")}
              >
                <Avatar name={author?.full_name ?? "A member"} tone={toneOf(author)} size="sm" />
                <div className="thr-msg__body">
                  <div className="thr-msg__who">
                    <b>{own ? "You" : author?.full_name ?? "A member"}</b>
                    <span className="mbr-mono">{logDateTime(m.created_at)}</span>
                  </div>
                  <p>{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Composer threadId={thread.id} closed={!!thread.closed_at} />
    </div>
  );
}
