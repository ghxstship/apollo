-- Every new foreign key from the program wave was left without an index: the
-- public listing filters on season_id, the series console counts by series_id,
-- the composer joins venue_id, and the credit/daybed/proposal reads all scan.
create index if not exists voyages_season_id_idx on public.voyages (season_id) where season_id is not null;
create index if not exists voyages_venue_id_idx on public.voyages (venue_id) where venue_id is not null;
create index if not exists voyages_series_id_idx on public.voyages (series_id) where series_id is not null;
create index if not exists voyages_format_idx on public.voyages (format) where format is not null;
create index if not exists voyage_sponsors_sponsor_id_idx on public.voyage_sponsors (sponsor_id);
create index if not exists voyage_daybeds_voyage_id_idx on public.voyage_daybeds (voyage_id);
create index if not exists member_event_proposals_proposer_idx on public.member_event_proposals (proposer_id, created_at desc);
create index if not exists member_event_proposals_status_idx on public.member_event_proposals (status, created_at desc);;
