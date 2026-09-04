import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader } from "@/components/site/section-header";
import { MAILBOX } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  alternates: { canonical: "/crew/wanted" },
  title: "Crew wanted",
  description: "Small crew, high standard, good light. Afloat and ashore, in Miami and Los Angeles.",
};

/* The four roles used to live in an array in this file, and crew_roles sat
   beside it holding its own four. They drifted, as two copies of anything do:
   the page had been corrected to Gangway ops while the row still said
   Harbormaster ops, a surface name this brand retired.

   The table is the source now. A role that opens or closes is a row somebody
   toggles in the Bridge, not a deploy. */
export default async function CrewPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crew_roles")
    .select("*")
    .eq("open", true)
    .order("position", { ascending: true });

  const roles = data ?? [];
  const count = roles.length;
  const heading =
    count === 0 ? "Nothing open right now." : count === 1 ? "One role open." : `${count} roles open.`;

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">
          <Link href="/crew" className="crew-back">
            The Cast & Crew
          </Link>
        </span>
        {/* Route = nav = title = h1: Crew wanted is the name in the footer and
            the tab, so it is the name here. "Work the season" opens the
            standfirst instead — it was "Work the water" once, over a paragraph
            about running it, and thirty-four of the fifty-two episodes never
            leave land. */}
        <h1>Crew wanted.</h1>
        <p className="ws-phead__sub">
          {/* A raw ampersand, not &amp;: the vocabulary gate matches this term
              as a literal substring of the source and does not decode entities,
              so the escaped form reads as absent. */}
          Work the season. The Cast & Crew are the club&rsquo;s own people — marine safety,
          hospitality, media, engineering. The cast are the ones it happens to;
          crew are the ones who make it happen, and crew is what this page is
          hiring. We take people who&rsquo;d do the job on
          their day off — and then we make sure they don&rsquo;t have to.
        </p>
      </div>
      <div className="crew-list">
        {/* A seat is what a member holds on an episode. A job is not one, and
            using the word for both makes the club's own vocabulary mean less. */}
        <SectionHeader eyebrow="Open roles" title={heading} />
        {roles.map((r) => (
          <Link key={r.id} href={`/crew/wanted/${r.slug}`} className="crew-row">
            <div>
              <div className="ws-ledger-row__t">{r.title}</div>
              <div className="ws-ledger-row__m">
                {[r.dept, r.employment, r.remote ? "Remote" : r.city]
                  .filter(Boolean)
                  .map((bit, i) => (
                    <span key={`${i}-${bit}`}>
                      {i > 0 ? "· " : ""}
                      {bit}
                    </span>
                  ))}
              </div>
              {r.blurb ? <p className="ws-ledger-row__body">{r.blurb}</p> : null}
            </div>
            <span className="ls-btn ls-btn--outline ls-btn--sm crew-row__go">Read the role</span>
          </Link>
        ))}
        {count === 0 ? (
          <p className="crew-none">
            No postings open at the moment. The club hires in bursts around a
            season — write to <a href={`mailto:${MAILBOX.crew}`}>{MAILBOX.crew}</a>{" "}
            and we will keep you in mind for the next one.
          </p>
        ) : (
          <p className="crew-none">
            Nothing that fits? Write to{" "}
            <a href={`mailto:${MAILBOX.crew}`}>{MAILBOX.crew}</a> anyway — good
            hands find a place aboard.
          </p>
        )}
      </div>
    </div>
  );
}
