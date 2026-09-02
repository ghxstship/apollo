import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Icon } from "@/components/ds";
import { LinkButton } from "@/components/site/link-button";
import { TaglineMark } from "@/components/site/logo";
import { SectionHeader } from "@/components/site/section-header";
import { ANCHOR, CLUB_ZONE, CITY_CODES, TAGLINE } from "@/lib/brand";
import { SETTING_LABEL, logMeta, roman } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { moduleTables } from "@/lib/module-tables";
import {
  depositChip,
  durationChip,
  fleetChip,
  weekChip,
} from "@/components/site/voyage-chips";
import { fleetByVoyage } from "@/components/site/voyage-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  /* absolute, or the root template appends the anchor to a title that already
     opens with it — "[un] anything goes here · [un]" shipped once. */
  title: { absolute: `${ANCHOR} ${TAGLINE}` },
};

const STEPS: Array<[string, string]> = [
  ["Apply.", "A short casting form, read by a person. We reply inside the week."],
  ["Board.", "Claim a pass from the manifest. Solo is normal — the cast meets at the gangway, not before."],
  ["See what happens.", "Cameras from boarding to docking. No scripts, no second takes."],
];

export default async function HomePage() {
  const supabase = await createClient();
  const [
    { data: voyages },
    { data: harbors },
    { data: posts },
    { data: episodes },
    { data: formatRows },
  ] = await Promise.all([
      supabase
        .from("voyages")
        .select(
          "id,slug,title,class,format,status,starts_at,ends_at,distance_nm,time_zone,media,blurb,deposit_required,deposit_cents"
        )
        .in("status", ["scheduled", "live", "weather_hold"])
      /* A sailing that has cast off is not on offer, whatever its status
         still says — the detail page and the manifest already knew this. */
      .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        /* Three next up plus whatever is live — twelve covers a full-season
           calendar's worth of underway sailings without reading the year. */
        .limit(12),
      supabase
        .from("harbors")
        .select("id,slug,name,status,coordinates,launch_year")
        .order("position", { ascending: true }),
      supabase
        .from("dispatch_posts")
        .select("id,slug,title,dek,tag,published_at")
        .order("published_at", { ascending: false })
        .limit(2),
      supabase
        .from("episodes")
        .select("id,number,title,dek,aired_at")
        .eq("state", "published")
        .order("number", { ascending: true })
        .limit(3),
      /* The formats, once, mapped by slug below — a card reads the format's own
         name, and reading the table per row would be one round trip per card.
         Another module's table, reached through the moduleTables seam. */
      moduleTables(supabase).from("activity_formats").select("slug, label"),
    ]);

  const formatLabelOf = new Map(
    ((formatRows ?? []) as Array<{ slug: string; label: string }>).map(
      (f) => [f.slug, f.label] as const
    )
  );

  /* The harbors line, said by the data. */
  const WORDS = ["No harbors", "One harbor", "Two harbors", "Three harbors", "Four harbors"];
  const openHarbors = (harbors ?? []).filter((h) => h.status === "open");
  const nextHarbor = (harbors ?? []).find((h) => h.status !== "open");
  const harborsLine = `${WORDS[openHarbors.length] ?? `${openHarbors.length} harbors`} now.${
    nextHarbor ? ` ${nextHarbor.name} is next.` : ""
  }`;

  const live = (voyages ?? []).filter((v) => v.status === "live");
  const nextUp = (voyages ?? []).filter((v) => v.status !== "live").slice(0, 3);
  /* Berth counts and hulls for the three cards only — the capacity view was
     being read for every sailing the club has ever raised. */
  const nextUpIds = nextUp.map((v) => v.id);
  const [{ data: capacity }, fleets] = await Promise.all([
    nextUpIds.length
      ? supabase.from("voyage_capacity").select("voyage_id,berths_left").in("voyage_id", nextUpIds)
      : Promise.resolve({ data: [] as Array<{ voyage_id: string | null; berths_left: number | null }> }),
    fleetByVoyage(nextUpIds),
  ]);
  const capacityById = new Map(
    (capacity ?? []).map((c) => [c.voyage_id, c] as const)
  );

  return (
    <>
      <header className="ws-hero">
        <div className="ls-container ws-hero__in">
          <div className="ls-eyebrow">Season I · Casting now</div>
          {/* The tagline lockup, not a bare phrase — owner ruling 2026-08-31:
              the hero is the §Tagline Active Rule mark (Anton anchor, mono
              lowercase phrase on the rule), never Anton alone, because the
              tagline is the one string the display face must not capitalise. */}
          <h1><TaglineMark /></h1>
          <p className="ws-hero__sub">
            Twelve strangers. One yacht. Cameras from boarding to docking —
            whatever happens after sunset is the show.
          </p>
          <div className="ws-hero__cta">
            <LinkButton href="/membership#apply" variant="gold" size="lg">
              Apply to be cast
            </LinkButton>
            <LinkButton href="/charters" variant="ghost" size="lg" inverse>
              See the charters <Icon name="ArrowUpRight" size={16} />
            </LinkButton>
          </div>
        </div>
      </header>

      {live.length > 0 ? (
        <>
          <div className="ws-liveseam"></div>
          <div className="ws-livestrip">
            <div className="ls-container ws-livestrip__in">
              <span className="ls-live">Live now</span>
              {live.map((v) => (
                <Link key={v.id} href={`/charters/${v.slug}`}>
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
            eyebrow="On this charter"
            title="Next up. Every camera on."
            aside={
              <LinkButton href="/charters" variant="ghost">
                All charters <Icon name="ArrowUpRight" size={15} />
              </LinkButton>
            }
          />
          <div className="ls-grid-3">
            {nextUp.map((v, i) => {
              const cap = capacityById.get(v.id);
              const left = cap?.berths_left ?? null;
              const seats = "passes";
              /* The badge: what this actually is, and how long it runs. The
                 format names itself; a sailing that has not been filed under
                 one falls back to where it happens. Hours are omitted rather
                 than guessed when the sailing has no stated end. */
              const formatLabel =
                (v.format && formatLabelOf.get(v.format)) || SETTING_LABEL[v.class] || "Afloat";
              const hours = durationChip(v.starts_at, v.ends_at);
              /* Ship's-log chips: which week, how many hulls, what holds a
                 pass. Nothing that scores or hurries the reader. */
              const meta = [
                ...logMeta(v.starts_at, v.distance_nm, v.time_zone),
                weekChip(v.starts_at),
                v.class === "sea" ? fleetChip(fleets.get(v.id) ?? []) : null,
                v.deposit_required ? depositChip(v.deposit_cents) : null,
              ].filter((m): m is string => Boolean(m));
              return (
                <Link
                  key={v.id}
                  href={`/charters/${v.slug}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                  className={"ls-rise-" + Math.min(i + 1, 3)}
                >
                  <Card
                    media={v.media}
                    eyebrow={`${formatLabel}${hours ? ` · ${hours}` : ""}`}
                    title={v.title}
                    meta={meta}
                    footer={
                      <>
                        {left != null ? (
                          <span className="ls-mono-data ws-upper">
                            {left} {seats} left
                          </span>
                        ) : null}
                        {v.status === "weather_hold" ? (
                          <Badge tone="caution">Weather hold</Badge>
                        ) : left != null && left <= 5 ? (
                          <Badge tone="caution">Last passes</Badge>
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
          <SectionHeader eyebrow="The format" title="Apply. Board. See what happens." />
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
          {/* Read from the harbors table rather than hardcoded: the copy used to
              promise the Balearics, which is not a harbor the club has, directly
              above a list naming Chicago and New York as the ones coming. */}
          <SectionHeader eyebrow="Harbors" title={harborsLine} />
          <div>
            {(harbors ?? []).map((h) => (
              <div className="ws-harbor-row" key={h.id}>
                <h3>{h.name}</h3>
                <span className="hm">
                  {CITY_CODES[h.slug] ? `${CITY_CODES[h.slug]} · ` : ""}
                  {h.coordinates}
                  {h.launch_year ? ` · ${roman(h.launch_year)}` : ""}
                </span>
                {h.status === "open" ? (
                  <Badge tone="positive">Open</Badge>
                ) : (
                  <Badge tone="outline">{h.status === "waitlist" ? "Waitlist" : "Soon"}</Badge>
                )}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-3)" }}>
            Founding passes in new harbors go to the waitlist first —{" "}
            <Link href="/membership#apply">get on the list</Link>.
          </p>
        </div>
      </section>

      <section className="ws-dispatch-teaser">
        <div className="ls-container">
          <SectionHeader
            eyebrow="The show"
            title="What the cameras kept."
            aside={
              <LinkButton href="/episodes" variant="ghost">
                All episodes <Icon name="ArrowUpRight" size={15} />
              </LinkButton>
            }
          />
          {(episodes ?? []).length > 0 ? (
            <div className="ls-grid-3" style={{ marginBottom: 28 }}>
              {(episodes ?? []).map((ep, i) => (
                <Card
                  key={ep.id}
                  media={(["day", "dusk", "dawn"] as const)[i % 3]}
                  eyebrow={`EPISODE ${String(ep.number).padStart(2, "0")}`}
                  title={ep.title}
                  meta={ep.aired_at ? [logMeta(ep.aired_at, null, CLUB_ZONE)[0]] : []}
                >
                  {ep.dek}
                </Card>
              ))}
            </div>
          ) : null}
          <div>
            {(posts ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/episodes/${p.slug}`}
                style={{ color: "inherit", textDecoration: "none", display: "block" }}
              >
                <div className="ws-dp-row">
                  <span className="ws-dp-row__d">
                    {logMeta(p.published_at, null, CLUB_ZONE)[0]} · {roman(new Date(p.published_at).getFullYear())}
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
          <h2>12 cabins. 200 applicants.</h2>
          <p>
            Casting is by application or invitation. Apply once, board a season —
            the cameras do the rest.
          </p>
          <div style={{ marginTop: 32 }}>
            <LinkButton href="/membership#apply" variant="outline" size="lg" inverse>
              Apply to be cast
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}
