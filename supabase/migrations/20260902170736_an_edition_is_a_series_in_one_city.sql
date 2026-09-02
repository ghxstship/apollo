/* Series, editions and seasons, on the Love Island model — owner decision
   2026-09-02.

   A SERIES is the named strand: Sandbar Social, Dinner Club. That is
   activity_formats, which until now was called a format; the word changed
   because Format is a back-of-house production term and a member never sees
   one. The table keeps its name, being plumbing.

   An EDITION is that series in one city — Sandbar Social Miami, Sandbar Social
   LA — the same property with its own cadence, capacity and crew, exactly the
   way Love Island UK and Love Island USA relate. voyage_series already held
   the cadence half of this and nothing else, so it becomes the edition: it
   gains the city it runs in and the series it is an edition of.

   A SEASON now belongs to an EDITION rather than to the club. This is the
   change that earns the whole model. Miami launched in 2026 and Chicago
   launches in 2027, so one global season counter would open the Chicago page
   on Season II with no Season I behind it. Per edition, Sandbar Social Miami
   can be in its second season while Chicago is in its first and both are true
   at once. series_id stays nullable so a genuinely club-wide season is still
   expressible.

   template_voyage_id drops NOT NULL because an edition has to be able to exist
   before its first episode does — under the old shape you could not name a run
   until you had already scheduled something into it, which is backwards.

   All three tables are empty (0 rows in voyage_series, seasons and venues), so
   there is no backfill and nothing to reconcile. That is why this lands now
   rather than after the first real run is scheduled. */

alter table public.voyage_series
  add column harbor_id uuid references public.harbors(id) on delete restrict,
  add column format text references public.activity_formats(slug)
    on update cascade on delete set null,
  alter column template_voyage_id drop not null;

comment on column public.voyage_series.harbor_id is
  'The city this edition runs in. Null means a series with no city edition yet.';
comment on column public.voyage_series.format is
  'The series (activity_formats.slug) this is an edition of. Display name is Series, not Format.';

alter table public.seasons
  add column series_id uuid references public.voyage_series(id) on delete cascade;

comment on column public.seasons.series_id is
  'The edition this season belongs to. Null means a club-wide season rather than an edition season.';

/* One edition of a series per city. Two rows saying Sandbar Social Miami is
   the ambiguity the whole model exists to remove — a member asking which one
   they belong to must have exactly one answer. Partial, because a series with
   no city yet is legal and several of them may sit unassigned at once. */
create unique index voyage_series_one_edition_per_city
  on public.voyage_series (format, harbor_id)
  where format is not null and harbor_id is not null;;
