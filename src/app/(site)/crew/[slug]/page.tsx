import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Badge } from "@/components/ds";
import { logDate } from "@/lib/format";
import { CLUB_ZONE } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

async function crewFor(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crew")
    .select("*")
    .eq("slug", slug)
    .eq("public", true)
    .eq("active", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const person = await crewFor(slug);
  if (!person) return { title: "Not on the roster" };
  return {
    alternates: { canonical: `/crew/${person.slug}` },
    /* The name alone: the h1 says it, and the tab should say the same thing.
       The role rides in the description when there is no bio to carry it. */
    title: person.display_name,
    description: person.bio ?? person.role_title,
  };
}

/* One of the crew, and what they are working.

   The billing is the point. In a filmed series the crew are characters, and a
   member who had a good night with a particular skipper should be able to find
   the next one they are on — which is the same reason a studio puts the
   instructor on the class card.

   Only confirmed billings appear, and only for people who opted in: the policy
   on crew_assignments admits a row to anon exactly when it is confirmed and the
   crew member is public and active, so an offer nobody answered never leaks and
   this page never has to remember to filter. */
export default async function CrewMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const person = await crewFor(slug);
  if (!person) notFound();

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data: billings } = await supabase
    .from("crew_assignments")
    .select("id, position_slug, episodes!inner(slug, title, starts_at, status, setting)")
    .eq("crew_id", person.id)
    .eq("status", "confirmed")
    .gte("episodes.starts_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(12);

  const rows = ((billings ?? []) as unknown as Array<{
    id: string;
    position_slug: string;
    episodes: { slug: string; title: string; starts_at: string; setting: string } | null;
  }>)
    .filter((b) => b.episodes)
    .sort((a, b) => Date.parse(a.episodes!.starts_at) - Date.parse(b.episodes!.starts_at));

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">
          <Link href="/crew" className="crew-back">
            The Cast &amp; Crew
          </Link>
        </span>
        <div className="crew-hero">
          <Avatar
            name={person.display_name}
            tone={
              (["gold", "sea", "ink", "sand"].includes(person.avatar_tone)
                ? person.avatar_tone
                : "ink") as "gold" | "sea" | "ink" | "sand"
            }
            size="lg"
          />
          <div>
            <h1>{person.display_name}</h1>
            <div className="crew-facts">
              {[person.role_title, person.city, person.since ? `Since ${new Date(person.since).getFullYear()}` : null]
                .filter(Boolean)
                .map((bit, i) => (
                  <span key={`${i}-${bit}`}>
                    {i > 0 ? "· " : ""}
                    {bit}
                  </span>
                ))}
            </div>
          </div>
        </div>
        {person.bio ? <p className="ws-phead__sub">{person.bio}</p> : null}
      </div>

      <div className="crew-list">
        <h2 className="crew-billing__h">Next on.</h2>
        {rows.length > 0 ? (
          rows.map((b) => (
            <Link key={b.id} href={`/episodes/${b.episodes!.slug}`} className="crew-row">
              <div>
                <div className="ws-ledger-row__t">{b.episodes!.title}</div>
                <div className="ws-ledger-row__m">
                  <span>{logDate(b.episodes!.starts_at, CLUB_ZONE)}</span>
                  <span>·</span>
                  <span>{b.episodes!.setting === "sea" ? "Afloat" : "Ashore"}</span>
                </div>
              </div>
              <Badge tone="outline">{b.position_slug.replace(/_/g, " ")}</Badge>
            </Link>
          ))
        ) : (
          <p className="crew-none">
            Nothing on the board for {person.display_name.split(" ")[0]} yet.
            The season is long — check the{" "}
            <Link href="/episodes">manifest</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
