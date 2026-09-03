import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ds";
import { MAILBOX } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { CrewApplyForm } from "./apply-form";

async function roleFor(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("crew_roles").select("*").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const role = await roleFor(slug);
  if (!role) return { title: "Role not found" };
  const where = role.remote ? "Remote" : role.city;
  return {
    alternates: { canonical: `/crew/wanted/${role.slug}` },
    title: `${role.title} — ${where}`,
    description: role.blurb ?? undefined,
  };
}

/* A posting, at its own address.

   The listing carried one blurb per role and a mailto:, which asked a candidate
   to decide on twenty words and then compose an email from nothing. This is the
   work, the bar, the money and the shape of the process — and the form that
   puts them in the pipeline the Bridge has been running by hand. */
export default async function CrewRolePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = await roleFor(slug);
  if (!role) notFound();

  const where = role.remote ? "Remote" : role.city;
  const facts = [role.dept, role.employment, where].filter(Boolean) as string[];

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">
          <Link href="/crew/wanted" className="crew-back">
            Crew wanted
          </Link>
        </span>
        <h1>{role.title}</h1>
        <div className="crew-facts">
          {facts.map((f, i) => (
            <span key={`${i}-${f}`}>
              {i > 0 ? "· " : ""}
              {f}
            </span>
          ))}
          {/* A closed posting still renders rather than 404ing: its URL is on
              somebody's clipboard, and "this one closed" is a better answer
              than a dead page. */}
          {role.open ? null : <Badge tone="caution">Closed</Badge>}
        </div>
      </div>

      <div className="crew-role">
        <div className="crew-role__body">
          {role.body ? <p className="crew-role__lede">{role.body}</p> : null}

          {role.responsibilities.length > 0 ? (
            <section className="crew-sec">
              <h2>The work.</h2>
              <ul>
                {role.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {role.requirements.length > 0 ? (
            <section className="crew-sec">
              <h2>What you need.</h2>
              <ul>
                {role.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {role.nice_to_have.length > 0 ? (
            <section className="crew-sec">
              <h2>What helps.</h2>
              <ul>
                {role.nice_to_have.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Null renders nothing rather than an empty heading — a posting with
              a Pay section and no pay in it is worse than one without. */}
          {role.comp ? (
            <section className="crew-sec">
              <h2>Pay.</h2>
              <p>{role.comp}</p>
            </section>
          ) : null}

          {role.process.length > 0 ? (
            <section className="crew-sec">
              <h2>How it goes.</h2>
              {/* Numbered because these really are a sequence — the one place
                  on this page where order carries information. */}
              <ol className="crew-steps">
                {role.process.map((step, i) => (
                  <li key={step}>
                    <span className="crew-steps__n">{String(i + 1).padStart(2, "0")}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="crew-role__apply" id="apply">
          {role.open ? (
            <CrewApplyForm roleId={role.id} roleTitle={role.title} />
          ) : (
            <div className="crew-closed">
              <span className="ws-zero__label">This one is closed</span>
              <p>
                It is not taking applications any more. The open roles are on the{" "}
                <Link href="/crew/wanted">crew page</Link>, and{" "}
                <a href={`mailto:${MAILBOX.crew}`}>{MAILBOX.crew}</a> reads
                everything either way.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
