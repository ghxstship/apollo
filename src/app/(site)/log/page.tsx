import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ds";
import { logDate, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CLUB_ZONE, MAILBOX } from "@/lib/brand";

export const metadata: Metadata = {
  alternates: { canonical: "/log" },
  title: "The Log",
  description: "The ship's log, published. What sails, what gathers, where to be at golden hour.",
};

export default async function LorePage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("log_posts")
    .select("*")
    .order("published_at", { ascending: false });

  return (
    <div className="ls-container">
      <div className="dp-head">
        <span className="ls-eyebrow" style={{ color: "var(--brass-deep)", display: "block", marginBottom: 16 }}>
          The Log · Sundays
        </span>
        <h1 className="dp-mast">The Log</h1>
        <p className="dp-mast__sub">The ship&rsquo;s log, published.</p>
      </div>
      <div className="dp-list">
        {/* An empty log used to render the masthead, the standfirst and then the
            grey mailto footnote with nothing between them — which reads as a
            page that failed rather than a season that has not been written yet.
            The gallery states its own emptiness properly; this now does too. */}
        {(posts ?? []).length === 0 ? (
          <div className="ws-dp-row" style={{ display: "block" }}>
            <div className="ws-dp-row__t">Nothing filed yet.</div>
            <p className="ws-dp-row__dek">
              The log opens with the first episode of the season. What the
              cameras keep is written up here, credited by name.
            </p>
          </div>
        ) : null}
        {(posts ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/log/${p.slug}`}
            style={{ color: "inherit", textDecoration: "none", display: "block" }}
          >
            <div className="ws-dp-row">
              <span className="ws-dp-row__d">
                {logDate(p.published_at, CLUB_ZONE)} · {roman(new Date(p.published_at).getFullYear())}
              </span>
              <div>
                <div className="ws-dp-row__t">{p.title}</div>
                {p.dek ? <p className="ws-dp-row__dek">{p.dek}</p> : null}
              </div>
              {p.tag ? <Badge tone="outline">{p.tag}</Badge> : null}
            </div>
          </Link>
        ))}
        <p style={{ padding: "40px 0 48px", fontSize: "var(--text-xs)", color: "var(--text-3)", maxWidth: "58ch" }}>
          The Log is written by the cast and crew, not a content team. Sailed
          something, cooked something, learned something? File a dispatch —{" "}
          <a href={`mailto:${MAILBOX.casting}`}>{MAILBOX.casting}</a>. Bylines always.
        </p>
      </div>
    </div>
  );
}
