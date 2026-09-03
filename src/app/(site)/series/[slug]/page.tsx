import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/site/link-button";
import { durationChip, weekChip } from "@/components/site/episode-chips";
import { EXPERIENCE_CLASSES, SURFACES, type ExperienceClassId } from "@/lib/brand";
import { SETTING_LABEL, logDate, logTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { readOneSeries, readSeasonOneEpisodes, seriesSetting } from "../data";

/* One strand, and its run.

   No generateStaticParams, and its absence is the decision rather than the
   omission. The docs offer it for statically generating dynamic segments at
   build time — but every read on this page goes through createClient(), which
   awaits cookies(), and a segment that reads cookies is dynamic by
   construction: there is no build-time render for the params to enumerate. The
   two public dynamic segments already shipped here, /episodes/[slug] and
   /log/[slug], are built the same way for the same reason. The Next 16 answer
   for "the slug set lives in a database and the page is request-rendered" is a
   maybeSingle() lookup and notFound() on the miss, which is what follows. */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const series = await readOneSeries(supabase, slug);
  return {
    alternates: { canonical: `/series/${slug}` },
    /* The strand's own name, not the strand's name plus the word Series — the
       h1 says one and the tab says the other, and a reader deserves the same
       name twice. Falls back to the surface name only when there is no series,
       which is a page that 404s anyway. */
    title: series?.label ?? SURFACES.series,
    description: series?.blurb ?? undefined,
  };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const series = await readOneSeries(supabase, slug);
  /* Unknown and stood-down are one answer: readOneSeries asks for active rows
     only, so a retired strand 404s exactly as an invented slug does. */
  if (!series) notFound();

  const episodes = await readSeasonOneEpisodes(supabase, series.slug);
  const klass = EXPERIENCE_CLASSES[series.experience_class as ExperienceClassId];
  /* Server-rendered per request, so "now" is request time — captured once and
     read the way /episodes/[slug] reads it. Date.now() is refused here by the
     purity rule; the constructor is the form this codebase already uses. */
  const nowMs = new Date().getTime();

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">
          {SURFACES.series} · Season I · Miami
        </span>
        <h1>{series.label}.</h1>
        <p className="ws-phead__sub">{series.blurb}</p>
        <div className="ws-ledger-row__m" style={{ marginTop: 16 }}>
          <span>{seriesSetting(series.category)}</span>
          {klass ? <span>· {klass.label}</span> : null}
          {series.requires_vetting ? <span>· Vetted</span> : null}
          <span>
            ·{" "}
            {episodes.length > 0
              ? `${episodes.length} ${episodes.length === 1 ? "Episode" : "Episodes"}`
              : "Nothing scheduled yet"}
          </span>
        </div>
      </div>

      {episodes.length > 0 ? (
        episodes.map((e) => {
          /* An episode's date and hour are read on its own city's clock, which
             the row carries — the same rule the manifest and the episode page
             keep, so one instant never prints as two times across surfaces. */
          const zone = e.time_zone;
          const hours = durationChip(e.starts_at, e.ends_at);
          /* Was `sailed`, and it printed SAILED on every past episode —
             including all of Night Watch and Showboat, which never leave land.
             Wrapped is the production word, true of both settings, and in the
             register the rest of the show already speaks. */
          const wrapped = new Date(e.starts_at).getTime() < nowMs;
          const meta = [
            SETTING_LABEL[e.setting] ?? "Afloat",
            weekChip(e.starts_at),
            hours,
            wrapped ? "Wrapped" : null,
          ].filter(Boolean) as string[];
          return (
            <Link
              key={e.slug}
              href={`/episodes/${e.slug}`}
              style={{ color: "inherit", textDecoration: "none", display: "block" }}
            >
              <div className="ws-vrow">
                <div className="ws-vrow__date">
                  <b>{logDate(e.starts_at, zone)}</b>
                  {logTime(e.starts_at, zone)}
                </div>
                <div>
                  <div className="ws-vrow__title">{e.title}</div>
                  {e.blurb ? <p className="ws-ledger-row__body">{e.blurb}</p> : null}
                  <div className="ws-vrow__meta">
                    {meta.map((m, i) => (
                      <span key={`${i}-${m}`}>
                        {i > 0 ? "· " : ""}
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                {/* No price and no pass count on this row. Both belong to the
                    episode and both change on the hour; a catalogue that
                    repeats them is a second place for them to go stale. The
                    manifest and the episode's own page carry the offer. */}
                <div className="ws-vrow__act" />
              </div>
            </Link>
          );
        })
      ) : (
        <div className="ws-zero">
          <span className="ws-zero__label">Nothing scheduled yet</span>
          <p>
            This strand has no episode on the calendar. The rest of the season
            does — the manifest carries every one of them.
          </p>
          <LinkButton href="/episodes" variant="outline" size="sm">
            See the manifest
          </LinkButton>
        </div>
      )}

      <p className="ws-harbor-note">
        Every episode above is filed under {series.label}.{" "}
        <Link href="/series">The other four strands</Link> run alongside it, and{" "}
        <Link href="/episodes">the manifest</Link> puts all five in date order.
      </p>
    </div>
  );
}
