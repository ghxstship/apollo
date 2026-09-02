import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Icon, StateBlock } from "@/components/ds";
import { SETTING_LABEL } from "@/lib/format";
import type { Tables } from "@/lib/supabase/types";
import { getMember, type DirectoryMember, type Profile } from "../data";
import { relTime } from "../relative";
import { ThreadsRealtime } from "./realtime";
import { WriteToShoreside } from "@/components/member/write-to-shoreside";

export const metadata: Metadata = { title: "Threads" };

const TONES = new Set(["ink", "sea", "gold", "sand"]);

function toneOf(p: { avatar_tone?: string | null } | undefined | null): "ink" | "sea" | "gold" | "sand" {
  const t = p?.avatar_tone;
  return t && TONES.has(t) ? (t as "ink" | "sea" | "gold" | "sand") : "sand";
}

export default async function ThreadsPage() {
  const { supabase, user } = await getMember();

  const { data: mine } = await supabase
    .from("thread_members")
    .select("*")
    .eq("profile_id", user.id);

  const ids = (mine ?? []).map((m) => m.thread_id);
  const readAt = new Map((mine ?? []).map((m) => [m.thread_id, m.last_read_at]));

  let threads: Tables<"threads">[] = [];
  let roster: Array<{ thread_id: string; profile_id: string }> = [];
  let messages: Array<{
    thread_id: string;
    body: string;
    created_at: string;
    author_id: string | null;
  }> = [];

  if (ids.length) {
    const [threadsRes, rosterRes, messagesRes] = await Promise.all([
      supabase.from("threads").select("*").in("id", ids),
      supabase.from("thread_members").select("thread_id,profile_id").in("thread_id", ids),
      /* Bounded. This selected EVERY message in every thread the reader belongs
         to, unpaginated, to render a two-line preview per row — so the cost of
         opening the list grew with the whole history, and PostgREST's 1000-row
         cap meant that past a thousand messages the "latest" preview silently
         became the latest of an arbitrary page. A preview needs the newest few,
         and 200 covers a roster far larger than this club has. */
      supabase
        .from("messages")
        .select("thread_id,body,created_at,author_id")
        .in("thread_id", ids)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    threads = threadsRes.data ?? [];
    roster = rosterRes.data ?? [];
    messages = messagesRes.data ?? [];
  }

  /* Messages arrive newest-first — the first hit per thread is the latest. */
  const latest = new Map<string, { body: string; created_at: string; author_id: string | null }>();
  for (const m of messages) if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);

  const voyageIds = threads.map((t) => t.voyage_id).filter((v): v is string => !!v);
  const otherIds = roster.filter((r) => r.profile_id !== user.id).map((r) => r.profile_id);

  const [voyagesRes, peopleRes] = await Promise.all([
    voyageIds.length
      ? supabase.from("voyages").select("id,title,class,starts_at").in("id", voyageIds)
      : Promise.resolve({ data: null }),
    otherIds.length
      ? supabase.from("member_directory").select("*").in("id", Array.from(new Set(otherIds)))
      : Promise.resolve({ data: null }),
  ]);

  const voyageById = new Map((voyagesRes.data ?? []).map((v) => [v.id, v]));
  const peopleById = new Map<string, DirectoryMember>((peopleRes.data ?? []).map((p) => [p.id, p]));

  const rows = threads
    .map((t) => {
      const last = latest.get(t.id) ?? null;
      const voyage = t.voyage_id ? voyageById.get(t.voyage_id) ?? null : null;
      const others = roster
        .filter((r) => r.thread_id === t.id && r.profile_id !== user.id)
        .map((r) => peopleById.get(r.profile_id))
        .filter((p): p is Profile => !!p);
      const other = others[0] ?? null;
      const read = readAt.get(t.id) ?? null;
      const unread = !!last && (!read || Date.parse(last.created_at) > Date.parse(read));
      const title =
        t.kind === "crew"
          ? `${voyage?.title ?? t.title ?? "An episode"} — crew`
          : t.kind === "direct"
            ? other?.full_name ?? "A member"
            : t.title ?? "Shoreside";
      /* A crew thread belongs to an episode, and what the header says about it
         is where it happens — afloat or ashore. */
      const eyebrow =
        t.kind === "crew"
          ? SETTING_LABEL[voyage?.class ?? "sea"] ?? "Afloat"
          : t.kind === "direct"
            ? "Direct"
            : "Shoreside";
      return {
        id: t.id,
        kind: t.kind,
        closed: !!t.closed_at,
        title,
        eyebrow,
        other,
        preview: last?.body ?? null,
        at: last?.created_at ?? t.created_at,
        unread,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <div style={{ maxWidth: 720, marginInline: "auto" }}>
      <ThreadsRealtime />
      <span className="mbr-eyebrow">Threads</span>
      <h1 className="mbr-h1" style={{ marginTop: 6 }}>
        A word between us.
      </h1>
      <p className="dir-lede">
        Crew threads open when you go aboard and close after the debrief. Direct
        words stay open as long as you both want them.
      </p>
      {/* The shore desk, from the member's side: threads.kind 'shoreside' has
          always had a queue on the Bridge, and this is the door into it. */}
      <div style={{ marginTop: 14 }}>
        <WriteToShoreside />
      </div>

      {rows.length === 0 ? (
        <StateBlock
          status="empty"
          icon="MessagesSquare"
          title="Nothing said yet."
          detail="Crew threads arrive with your next pass. Until then, the roster is the way in."
          action={
            <Link href="/directory" className="ls-btn ls-btn--outline ls-btn--sm">
              Open the directory
            </Link>
          }
        />
      ) : (
        <div className="thr-list">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/threads/${r.id}`}
              className={["thr-row", r.closed ? "thr-row--closed" : ""].filter(Boolean).join(" ")}
            >
              {r.kind === "direct" && r.other ? (
                <Avatar name={r.other.full_name ?? "A member"} tone={toneOf(r.other)} />
              ) : (
                <span className="wrd-ic">
                  <Icon name={r.kind === "crew" ? "Users" : "LifeBuoy"} size={16} />
                </span>
              )}
              <div className="thr-row__body">
                <span className="thr-row__eyebrow mbr-mono">{r.eyebrow}</span>
                <b>{r.title}</b>
                {r.preview ? <p>{r.preview}</p> : <p className="thr-row__quiet">No word yet.</p>}
                {r.closed ? (
                  <span className="mbr-mono thr-row__closed">Closed after the debrief</span>
                ) : null}
              </div>
              <span className="thr-row__meta mbr-mono">
                {r.unread && !r.closed ? <span className="ls-live" role="img" aria-label="Unread"></span> : null}
                {relTime(r.at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
