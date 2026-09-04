import type { Metadata } from "next";
import { CLUB_ZONE } from "@/lib/brand";
import { logDateTime } from "@/lib/format";
import { getOperator } from "../../data";
import { must, mustValue } from "../../staff";
import { PollsClient, type PollView } from "./polls-client";

export const metadata: Metadata = { title: "Polls" };

/* Questions to the club, and how they went. The tally comes from poll_results,
   which answers staff at any hour and members only once the question has
   closed — so the live count on this screen is the Bridge's alone. */
export default async function PollsPage() {
  const { supabase } = await getOperator();
  const pollsRes = await supabase.from("polls").select("*").order("created_at", { ascending: false }).limit(40);
  const polls = must(pollsRes);

  const tallies = await Promise.all(
    polls.map((p) => supabase.rpc("poll_results", { p_poll: p.id }))
  );

  const now = new Date().getTime();
  const rows: PollView[] = polls.map((p, i) => {
    const options = Array.isArray(p.options) ? p.options.map((o) => String(o)) : [];
    const counts = mustValue(tallies[i], []);
    const votes = options.map((label, idx) => ({
      label,
      votes: Number(counts.find((c) => c.option === idx)?.votes ?? 0),
    }));
    return {
      id: p.id,
      question: p.question,
      options: votes,
      total: votes.reduce((n, v) => n + v.votes, 0),
      closesAt: logDateTime(p.closes_at, CLUB_ZONE),
      open: new Date(p.closes_at).getTime() > now,
      settled: p.settled,
    };
  });

  return (
    <div>
      <span className="hm-eyebrow">Polls</span>
      <h1 className="hm-h1">Ask the club.</h1>
      <p className="hm-lede">
        One question, two to six answers, a closing hour. Members vote once and see the count when
        it closes; the Bridge sees it as it runs. A question is about the club — a venue, a night,
        a name — and is never about a person.
      </p>
      <PollsClient rows={rows} />
    </div>
  );
}
