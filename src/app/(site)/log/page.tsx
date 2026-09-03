import type { Metadata } from "next";
import { logDate, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CLUB_ZONE, MAILBOX } from "@/lib/brand";
import { LogShelf, type LogEntry } from "./shelf";

export const metadata: Metadata = {
  alternates: { canonical: "/log" },
  title: "The Log",
  description:
    "What the cameras kept. Written by the cast and crew, credited by name, one episode at a time.",
};

export default async function LorePage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("log_posts")
    .select("*")
    .order("published_at", { ascending: false });

  const entries: LogEntry[] = (posts ?? []).map((p) => {
    const year = String(new Date(p.published_at).getFullYear());
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      dek: p.dek,
      tag: p.tag,
      dateLabel: logDate(p.published_at, CLUB_ZONE),
      year,
      yearRoman: roman(Number(year)),
      publishedMs: Date.parse(p.published_at),
    };
  });

  return (
    <div className="ls-container">
      <div className="dp-head">
        <span className="ls-eyebrow" style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}>
          The Log · Sundays
        </span>
        <h1 className="dp-mast">The Log</h1>
        {/* Was "The ship's log, published." — a boat metaphor standing in front
            of a camera product, on a page where thirty-four of the season's
            fifty-two episodes never leave land. The homepage already had the
            line this page needed. */}
        <p className="dp-mast__sub">What the cameras kept.</p>
      </div>
      {/* Dates are formatted here rather than in the browser: the club's zone
          is the server's to know, and a client component that computed it would
          render one string on the server and another after hydration. */}
      <LogShelf entries={entries} />
      <p className="dp-footnote">
        The Log is written by the cast and crew, not a content team. Sailed
        something, cooked something, learned something? File a dispatch —{" "}
        <a href={`mailto:${MAILBOX.casting}`}>{MAILBOX.casting}</a>. Bylines always.
      </p>
    </div>
  );
}
