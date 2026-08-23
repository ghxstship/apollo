import type { Metadata } from "next";
import { getOperator } from "../../data";
import { ShoresideClient, type ThreadCard } from "./shoreside-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Shoreside" };

export default async function ShoresidePage() {
  const { supabase } = await getOperator();

  const threadsRes = await supabase
    .from("threads")
    .select("*")
    .eq("kind", "shoreside")
    .order("created_at", { ascending: false });
  const threads = must(threadsRes);
  const threadIds = threads.map((t) => t.id);

  const [membersRes, messagesRes] = await Promise.all([
    threadIds.length
      ? supabase.from("thread_members").select("thread_id, profile_id").in("thread_id", threadIds)
      : Promise.resolve({ data: [] as Array<{ thread_id: string; profile_id: string }> }),
    threadIds.length
      ? supabase
          .from("messages")
          .select("id, thread_id, author_id, body, created_at")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            thread_id: string;
            author_id: string | null;
            body: string;
            created_at: string;
          }>,
        }),
  ]);

  const members = must(membersRes);
  const messages = must(messagesRes);

  const peopleIds = [
    ...new Set([
      ...members.map((m) => m.profile_id),
      ...messages.map((m) => m.author_id).filter((id): id is string => !!id),
    ]),
  ];
  const peopleRes = peopleIds.length
    ? await supabase.from("profiles").select("id, full_name, member_no, is_staff").in("id", peopleIds)
    : { data: [] as Array<{ id: string; full_name: string | null; member_no: string | null; is_staff: boolean }> };
  const people = new Map((must(peopleRes)).map((p) => [p.id, p]));

  const cards: ThreadCard[] = threads.map((t) => {
    const roster = members.filter((m) => m.thread_id === t.id);
    const member = roster.map((r) => people.get(r.profile_id)).find((p) => p && !p.is_staff);
    const log = messages
      .filter((m) => m.thread_id === t.id)
      .map((m) => {
        const author = m.author_id ? people.get(m.author_id) : undefined;
        return {
          id: m.id,
          body: m.body,
          createdAt: m.created_at,
          author: author?.full_name ?? "Someone off the roll",
          staff: author?.is_staff ?? false,
        };
      });
    const last = log[log.length - 1];
    return {
      id: t.id,
      title: t.title ?? "Shoreside",
      member: member?.full_name ?? "Unknown member",
      memberNo: member?.member_no ?? "—",
      closed: !!t.closed_at,
      lastAt: last?.createdAt ?? t.created_at,
      lastLine: last?.body ?? "No word yet.",
      waiting: !!last && !last.staff,
      messages: log,
    };
  });

  /* Whoever is waiting on us comes first; after that, most recent word. */
  cards.sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    return a.lastAt < b.lastAt ? 1 : -1;
  });

  return (
    <div>
      <span className="hm-eyebrow">Shoreside</span>
      <h1 className="hm-h1">The concierge line.</h1>
      <p className="hm-lede">
        A member asking a person, not the agent. Answer in your own words.
      </p>
      <p className="hm-note" style={{ marginTop: 10, maxWidth: "60ch" }}>
        The hand-off is not wired yet: The Producer cannot open a line here, so
        this stays empty until it can. Replies work the moment a thread arrives.
      </p>
      <ShoresideClient threads={cards} />
    </div>
  );
}
