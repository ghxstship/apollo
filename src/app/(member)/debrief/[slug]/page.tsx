import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, StateBlock } from "@/components/ds";
import { logDate, logDateTime } from "@/lib/format";
import { getMember } from "../../data";
import { DebriefForm } from "./debrief-form";

/* Route, title and h1 agree: Debrief. The eyebrow carries the episode. */
export const metadata: Metadata = { title: "Debrief" };

export default async function DebriefPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase, user, zone } = await getMember();

  const { data: episode } = await supabase
    .from("episodes")
    .select("id, slug, title, starts_at, ends_at, time_zone, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!episode) notFound();

  /* The pass is the standing to answer; the row is whether they already have.
     Both are the member's own under RLS, so a stranger's slug reads as no pass. */
  const [{ data: pass }, { data: answered }] = await Promise.all([
    supabase
      .from("passes")
      .select("id")
      .eq("episode_id", episode.id)
      .eq("profile_id", user.id)
      .eq("status", "aboard")
      .maybeSingle(),
    supabase
      .from("debriefs")
      .select("note, again, created_at")
      .eq("episode_id", episode.id)
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  /* The question is asked when the night is over. Before it has begun there is
     nothing to say yet, and the notice that carries this link is only written
     on completion — so this branch is a bookmark arriving early. */
  /* Server-rendered per request, so "now" is request time. */
  const nowMs = new Date().getTime();
  const notYet =
    (episode.status === "scheduled" || episode.status === "weather_hold") &&
    Date.parse(episode.starts_at) > nowMs;

  return (
    <div className="ls-fade" style={{ maxWidth: 680 }}>
      <Link href="/inbox" className="mbr-mono mbr-plain">
        <Icon name="ArrowUpRight" size={12} /> INBOX
      </Link>

      <span className="mbr-eyebrow" style={{ display: "block", marginTop: 18 }}>
        {episode.title} · {logDate(episode.starts_at, episode.time_zone)}
      </span>
      <h1 className="mbr-h1">Debrief.</h1>
      <p className="dbf-lede">
        One question, no scores. What you write goes to Shoreside and nowhere else —
        never a star, never public.
      </p>

      {!pass ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="MessageSquare"
            title="This one was not your night."
            detail="The debrief is for the crew who were aboard. Your own episodes ask it when they end."
          />
        </div>
      ) : answered ? (
        <section className="mbr-sec">
          <span className="mbr-eyebrow">Answered · {logDateTime(answered.created_at, zone)}</span>
          <div className="dbf-answer">
            <span className="mbr-mono">ANYTHING THE BRIDGE SHOULD KNOW?</span>
            <p>{answered.note?.trim() ? answered.note : "Nothing written — the one question was enough."}</p>
            <span className="mbr-mono dbf-answer__q">WOULD YOU SAIL WITH THIS CREW AGAIN?</span>
            <p>
              {answered.again === true ? "Yes." : answered.again === false ? "No." : "Left unanswered."}
            </p>
          </div>
          <p className="dbf-note" style={{ marginTop: 12 }}>
            One answer a night, and this was it. Anything more goes to Shoreside directly.
          </p>
        </section>
      ) : notYet ? (
        <div className="mbr-sec">
          <StateBlock
            status="empty"
            icon="Hourglass"
            title="The question waits for the night."
            detail={`${episode.title} departs ${logDateTime(episode.starts_at, episode.time_zone)}. A notice brings you back here when it is in the log.`}
          />
        </div>
      ) : (
        <section className="mbr-sec">
          <DebriefForm episodeId={episode.id} slug={episode.slug} />
        </section>
      )}
    </div>
  );
}
