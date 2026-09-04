import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Icon, StateBlock } from "@/components/ds";
import { SETTING_LABEL, logDateTime } from "@/lib/format";
import { getMember, type DirectoryMember, type Profile } from "../../data";
import { Composer, ThreadLive } from "./live";

/* The title is the thread's own name, which is also the h1 — a direct thread
   is titled by the other member, a crew thread by its episode. getMember is
   request-cached, so this costs one small read. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await getMember();
  const { data } = await supabase.from("threads").select("kind,title").eq("id", id).maybeSingle();
  return { title: data?.title ?? (data?.kind === "crew" ? "Crew thread" : "Thread") };
}

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(p: { avatar_tone?: string | null } | undefined | null): "ink" | "sea" | "gold" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "sand";
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, zone } = await getMember();

  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
  if (!thread) notFound();

  const { data: roster } = await supabase
    .from("thread_members")
    .select("profile_id")
    .eq("thread_id", thread.id);
  if (!(roster ?? []).some((r) => r.profile_id === user.id)) notFound();

  /* The latest three hundred, read newest-first and turned round — a
     conversation two seasons long is not rendered whole on every open. */
  const { data: newest } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const messages = (newest ?? []).slice().reverse();

  const peopleIds = Array.from(
    new Set([
      ...(roster ?? []).map((r) => r.profile_id),
      ...(messages ?? []).map((m) => m.author_id).filter((a): a is string => !!a),
    ])
  );
  const [peopleRes, voyageRes] = await Promise.all([
    peopleIds.length
      ? supabase.from("member_directory").select("*").in("id", peopleIds)
      : Promise.resolve({ data: null }),
    thread.episode_id
      ? supabase
          .from("episodes")
          .select("id,title,setting,starts_at")
          .eq("id", thread.episode_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const peopleById = new Map<string, DirectoryMember>((peopleRes.data ?? []).map((p) => [p.id, p]));
  const episode = voyageRes.data;

  const others = (roster ?? [])
    .filter((r) => r.profile_id !== user.id)
    .map((r) => peopleById.get(r.profile_id))
    .filter((p): p is Profile => !!p);

  /* A direct thread whose other seat is empty: the member left, or a moderator
     removed them. The header used to fall back to "A member" while every
     message below was bylined with their real name — the same screen
     contradicting itself — and the composer stayed live, so a member could go
     on writing into a room nobody was in. Name them from the messages that are
     still there, and say plainly that they are gone. */
  const departed =
    thread.kind === "direct" &&
    others.length === 0 &&
    (messages ?? []).some((m) => m.author_id !== user.id);
  const departedName =
    departed
      ? (messages ?? [])
          .map((m) => (m.author_id !== user.id ? peopleById.get(m.author_id ?? "")?.full_name : null))
          .find((n): n is string => !!n) ?? "That member"
      : null;

  const title =
    thread.kind === "crew"
      ? `${episode?.title ?? thread.title ?? "An episode"} — crew`
      : thread.kind === "direct"
        ? others[0]?.full_name ?? departedName ?? "A member"
        : thread.title ?? "Shoreside";
  /* The thread header states where the episode happens, not how it is filed. */
  const eyebrow =
    thread.kind === "crew"
      ? SETTING_LABEL[episode?.setting ?? "sea"] ?? "Afloat"
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
        {departed ? (
          <p className="mbr-mono thr-closed">
            {departedName} has left this conversation
          </p>
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
        /* role="log": realtime inserts refresh this list, and without it a
           screen reader is never told a reply arrived. */
        <div
          className="thr-msgs"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
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
                    <span className="mbr-mono">{logDateTime(m.created_at, zone)}</span>
                  </div>
                  <p>{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Composer threadId={thread.id} closed={!!thread.closed_at || departed} />
    </div>
  );
}
