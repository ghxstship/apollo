import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Icon } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { SectionHeader } from "@/components/site/section-header";
import { EVENT_CLASS_LABEL, logMeta, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "LYRE SOCIAL — Voyages and salons, at sea and ashore.",
};

const STEPS: Array<[string, string]> = [
  ["Apply.", "A short application, read by a person. A salon invitation usually follows within the week."],
  ["Board.", "Claim a berth from the manifest. Solo is normal — crews form at muster, not before."],
  ["Belong.", "Fathoms bank with every mile. The person across the cockpit becomes someone you'd sail with again."],
];

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: voyages }, { data: capacity }, { data: harbors }, { data: posts }] =
    await Promise.all([
      supabase
        .from("voyages")
        .select("*")
        .in("status", ["scheduled", "live", "weather_hold"])
        .order("starts_at", { ascending: true }),
      supabase.from("voyage_capacity").select("*"),
      supabase.from("harbors").select("*").order("position", { ascending: true }),
      supabase
        .from("dispatch_posts")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(2),
    ]);

  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.voyage_id, c] as const)
  );
  const live = (voyages ?? []).filter((v) => v.status === "live");
  const nextUp = (voyages ?? []).filter((v) => v.status !== "live").slice(0, 3);

  return (
    <>
      <header className="ws-hero">
        <div className="ls-container ws-hero__in">
          <div className="ls-eyebrow">A membership club — at sea and ashore</div>
          <h1>The long way home.</h1>
          <p className="ws-hero__sub">
            Voyages at sea. Salons ashore. A crew worth the crossing — Miami, Los
            Angeles, and the waters beyond.
          </p>
          <div className="ws-hero__cta">
            <LinkButton href="/membership#apply" variant="brass" size="lg">
              Request invitation
            </LinkButton>
            <LinkButton href="/voyages" variant="ghost" size="lg" inverse>
              View voyages <Icon name="ArrowUpRight" size={16} />
            </LinkButton>
          </div>
        </div>
      </header>

      {live.length > 0 ? (
        <>
          <div className="ws-liveseam ls-lava-flow"></div>
          <div className="ws-livestrip">
            <div className="ls-container ws-livestrip__in">
              <span className="ls-live">Live now</span>
              {live.map((v) => (
                <Link key={v.id} href={`/voyages/${v.slug}`}>
                  {v.title} — underway
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <section className="ls-section" style={{ paddingBlock: 96 }}>
        <div className="ls-container">
          <SectionHeader
            eyebrow="The season's manifest"
            title="Next up on the water."
            aside={
              <LinkButton href="/voyages" variant="ghost">
                All voyages <Icon name="ArrowUpRight" size={15} />
              </LinkButton>
            }
          />
          <div className="ls-grid-3">
            {nextUp.map((v, i) => {
              const cap = capacityById.get(v.id);
              const left = cap?.berths_left ?? null;
              const seats = v.kind === "salon" ? "seats" : "berths";
              return (
                <Link
                  key={v.id}
                  href={`/voyages/${v.slug}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                  className={"ls-rise-" + Math.min(i + 1, 3)}
                >
                  <Card
                    media={v.media}
                    eyebrow={`${EVENT_CLASS_LABEL[v.class]} · ${v.kind === "salon" ? "Salon" : "Voyage"}`}
                    title={v.title}
                    meta={logMeta(v.starts_at, v.distance_nm)}
                    footer={
                      <>
                        {left != null ? (
                          <span className="ls-mono-data ws-upper">
                            {left} {seats} left
                          </span>
                        ) : null}
                        {v.status === "weather_hold" ? (
                          <Badge tone="clay">Weather hold</Badge>
                        ) : left != null && left <= 5 ? (
                          <Badge tone="clay">Last berths</Badge>
                        ) : null}
                      </>
                    }
                  >
                    {v.blurb}
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: "0 96px" }}>
        <div className="ls-container">
          <SectionHeader eyebrow="How it works" title="Three steps aboard." />
          <div className="ws-steps">
            {STEPS.map(([title, body], i) => (
              <div className="ws-step" key={title}>
                <b>{roman(i + 1)}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ paddingBlock: "0 96px" }}>
        <div className="ls-container">
          <SectionHeader eyebrow="Harbors" title="Two harbors now. Two more at first light." />
          <div>
            {(harbors ?? []).map((h) => (
              <div className="ws-harbor-row" key={h.id}>
                <h3>{h.name}</h3>
                <span className="hm">
                  {h.coordinates}
                  {h.launch_year ? ` · ${roman(h.launch_year)}` : ""}
                </span>
                {h.status === "open" ? (
                  <Badge tone="laurel">Open</Badge>
                ) : (
                  <Badge tone="outline">{h.status === "waitlist" ? "Waitlist" : "Soon"}</Badge>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>
            Founding berths in new harbors go to the waitlist first —{" "}
            <Link href="/membership#apply">join the manifest</Link>.
          </p>
        </div>
      </section>

      <section className="ws-dispatch-teaser">
        <div className="ls-container">
          <SectionHeader
            eyebrow="The Dispatch"
            title="The ship's log, published."
            aside={
              <LinkButton href="/dispatch" variant="ghost">
                All entries <Icon name="ArrowUpRight" size={15} />
              </LinkButton>
            }
          />
          <div>
            {(posts ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/dispatch/${p.slug}`}
                style={{ color: "inherit", textDecoration: "none", display: "block" }}
              >
                <div className="ws-dp-row">
                  <span className="ws-dp-row__d">
                    {logMeta(p.published_at)[0]} · {roman(new Date(p.published_at).getFullYear())}
                  </span>
                  <div>
                    <div className="ws-dp-row__t">{p.title}</div>
                    {p.dek ? <p className="ws-dp-row__dek">{p.dek}</p> : null}
                  </div>
                  {p.tag ? <Badge tone="outline">{p.tag}</Badge> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="ws-band">
        <div className="ls-container">
          <h2>Berths are few by design.</h2>
          <p>
            Membership is by invitation or application. Apply once, sail a season —
            the water does the rest.
          </p>
          <div style={{ marginTop: 32 }}>
            <LinkButton href="/membership#apply" variant="outline" size="lg" inverse>
              Request invitation
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
