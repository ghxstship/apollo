import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ds";
import { SectionHeader } from "@/components/site/section-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  alternates: { canonical: "/crew" },
  title: "The Cast & Crew",
  description:
    "The people who run the room, the water, the cameras and the welcome — and who you will meet on the night.",
};

/* /crew is the people now, and hiring moved to /crew/wanted.

   The other way round was the wrong shape: crew means the humans, and a club
   whose premise is a filmed series should be able to say who is in it before it
   says it is recruiting. The move cost nothing — the postings had been live for
   an hour and nothing outside this repository linked to them.

   Everyone here opted in. crew.public defaults to false, so being scheduled
   puts nobody on this page; a second, deliberate decision does. */
export default async function CrewIndexPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crew")
    .select("*")
    .eq("public", true)
    .eq("active", true)
    .order("position", { ascending: true });

  const crew = data ?? [];

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">The Cast & Crew</span>
        <h1>Who runs it.</h1>
        <p className="ws-phead__sub">
          The cast are who the cameras follow. Crew run the room, the water, the
          cameras and the welcome — and unlike most of this industry, they are
          not anonymous. You will meet them on the night, and the manifest says
          who before you go.
        </p>
      </div>

      <div className="crew-list">
        {crew.length > 0 ? (
          <>
            <SectionHeader eyebrow="On the roster" title="The crew." />
            <div className="crew-grid">
              {crew.map((c) => (
                <Link key={c.id} href={`/crew/${c.slug}`} className="crew-card">
                  <Avatar
                    name={c.display_name}
                    tone={
                      (["gold", "sea", "ink", "sand"].includes(c.avatar_tone)
                        ? c.avatar_tone
                        : "ink") as "gold" | "sea" | "ink" | "sand"
                    }
                    size="lg"
                  />
                  <span className="crew-card__name">{c.display_name}</span>
                  <span className="crew-card__role">
                    {[c.role_title, c.city].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          /* Not an error and not a gap in the club — nobody has opted in yet,
             which is the correct default and reads as one. */
          <div className="ws-zero">
            <span className="ws-zero__label">Not yet</span>
            <p>
              The crew are working; none of them has chosen to be listed here
              yet. You will still meet them on the night.
            </p>
          </div>
        )}

        <p className="crew-none">
          Want the job? <Link href="/crew/wanted">The open roles are here</Link>.
        </p>
      </div>
    </div>
  );
}
