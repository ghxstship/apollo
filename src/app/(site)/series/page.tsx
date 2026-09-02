import type { Metadata } from "next";
import { LinkButton } from "@/components/site/link-button";
import { EXPERIENCE_CLASSES, SURFACES, type ExperienceClassId } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { listsToTheShore, readSeasonOneEpisodes, readSeries, seriesSetting } from "./data";

export const metadata: Metadata = {
  alternates: { canonical: "/series" },
  title: SURFACES.series,
  description:
    "Five named strands run through Season I. What each one is, and how many episodes are filed under it.",
};

/* The five strands, on the open water side of the sign-in.

   A visitor met a series only as an uppercase eyebrow on an episode card, which
   is a label rather than an explanation: it named a thing the site never
   defined. The member-side catalogue has explained it since the taxonomy
   landed, and explains it to the one audience that no longer needs convincing.
   This page is the same five facts, before the gate.

   Read through the same seam and the same anon-scoped client the public episode
   listing uses — no service-role key on a shore page, and nothing invented when
   a read comes back empty. */

export default async function SeriesPage() {
  const supabase = await createClient();
  const [allSeries, episodes] = await Promise.all([
    readSeries(supabase),
    readSeasonOneEpisodes(supabase),
  ]);
  const series = allSeries.filter(listsToTheShore);

  /* One pass over the season rather than a count query per strand — five reads
     of the same table to produce five integers is five round trips for one. */
  const filed = new Map<string, number>();
  for (const e of episodes) {
    if (!e.series) continue;
    filed.set(e.series, (filed.get(e.series) ?? 0) + 1);
  }

  return (
    <div className="ls-container">
      <div className="ws-phead">
        <span className="ls-eyebrow">Season I · Miami</span>
        <h1>{SURFACES.series}.</h1>
        <p className="ws-phead__sub">
          A series is a named strand the club runs all season. Five of them carry
          Season I, and every episode on the manifest is filed under one — the
          word above its title on the card is the strand it belongs to.
        </p>
      </div>

      {series.length > 0 ? (
        series.map((s) => {
          const count = filed.get(s.slug) ?? 0;
          const klass = EXPERIENCE_CLASSES[s.experience_class as ExperienceClassId];
          const meta = [
            seriesSetting(s.category),
            klass?.label ?? null,
            /* Zero is a fact, not a blank. A strand with nothing on the
               calendar yet says so rather than printing an empty chip. */
            count > 0
              ? `${count} ${count === 1 ? "Episode" : "Episodes"}`
              : "Nothing scheduled yet",
          ].filter(Boolean) as string[];
          return (
            <div className="ws-ledger-row" key={s.slug}>
              <div>
                <div className="ws-ledger-row__t">{s.label}</div>
                <div className="ws-ledger-row__m">
                  {meta.map((m, i) => (
                    <span key={`${i}-${m}`}>
                      {i > 0 ? "· " : ""}
                      {m}
                    </span>
                  ))}
                </div>
                <p className="ws-ledger-row__body">{s.blurb}</p>
              </div>
              <LinkButton href={`/series/${s.slug}`} variant="outline" size="sm">
                The run
              </LinkButton>
            </div>
          );
        })
      ) : (
        /* The catalogue is a read, and a read can come back empty. Better an
           honest gap than a page that implies the club has no series. */
        <div className="ws-zero">
          <span className="ws-zero__label">Nothing to show</span>
          <p>
            The catalogue is not answering. The manifest still is — every episode
            of the season is on it.
          </p>
          <LinkButton href="/episodes" variant="outline" size="sm">
            See the manifest
          </LinkButton>
        </div>
      )}

      <p className="ws-harbor-note">
        A season belongs to its city. Season I is Miami&rsquo;s first year;
        another city opens on its own Season I, and both are true at once.
      </p>
    </div>
  );
}
