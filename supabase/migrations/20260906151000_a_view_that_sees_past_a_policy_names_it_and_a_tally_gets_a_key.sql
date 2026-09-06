-- Two advisory classes, closed by argument rather than by change.
--
-- Nine views in this schema run as their owner instead of as the member who
-- reads them, and the advisor calls every one an ERROR. Nothing leaks today:
-- each of the nine scopes itself in its own body, and four of them answer a
-- signed-out reader with nothing at all. What was missing is the reason. Six
-- of the nine carried no comment whatever, and a definer view with no comment
-- is a shape the next person copies -- they write one beside it, leave out the
-- WHERE clause, and the whole class stops meaning anything.
--
-- So each was tested rather than argued over. The corpus was replayed into an
-- isolated database, and five people were seeded into it: a listed member, a
-- member who had opted out of the directory, a paused member, a member who had
-- left, and an officer. Every view was read by each of them, and by a
-- signed-out visitor, twice over -- once as it stands, once with
-- security_invoker on. All nine changed what somebody could see:
--
--   agreement_standing        in_force flipped to false on a live, counter-
--                             signed contract, and the row for a signature
--                             made on a since-retired version vanished
--   episode_capacity          aboard and waitlisted collapsed to the reader's
--                             own pass; a signed-out reader saw zero
--   episode_segment_capacity  the same, so remaining overstated the free places
--   member_affinity           empty for every member: the far side of the
--                             self-join is somebody else's pass
--   member_directory          a member saw only their own row
--   member_engagement         the same
--   member_league             the same
--   own_counter_signature     empty: counter_signatures is the vetting team's
--   own_vetting_state         empty: so is the vetting file
--
-- Not one of those could be recovered without opening a table up, and opening
-- a table up to satisfy a linter is the wrong trade. So all nine stay as they
-- are, and each now says on itself which policy it exists to see past.
-- security_report() already refuses any definer view that is not on its
-- whitelist, so a tenth still cannot arrive by accident; what this adds is the
-- reason beside the name, for whoever reads the whitelist next.

comment on view public.agreement_standing is
  'Where a member stands on each document. Runs as its owner to see past two policies: "staff read counter-signatures" on counter_signatures, which is the vetting team''s alone because the row carries the countersigning officer''s address, and "members see published versions" on document_versions, which would hide a signature the member truly made on a version since retired. It scopes itself instead -- your own rows, or all of them for staff -- and never shows the officer''s address.';

comment on view public.episode_capacity is
  'How full an episode is. Runs as its owner to see past "own passes or staff" on passes: the tally is the whole room, and a caller who may read only their own pass would find every episode empty. It names no member and no pass, only totals.';

comment on view public.episode_segment_capacity is
  'What is left in each segment of an episode. Runs as its owner for the reason episode_capacity does: under "own passes or staff" on passes every tally would fall to the caller''s own row, and remaining would overstate the free places. It names no member.';

comment on view public.member_affinity is
  'How many episodes two members have shared. Runs as its owner to see past "own passes or staff" on passes -- the far side of the join is somebody else''s pass, so as the caller it returns nothing at all. It scopes itself to the caller''s own rows, or to everything for staff.';

comment on view public.member_directory is
  'The member list as a member may read it. Runs as its owner to see past "own profile or staff" on profiles, which would leave a member reading only themselves. It does the withholding itself instead: a member who is unlisted, or not active, is a tone and nothing more -- unless shares_ground_with() says the two of you have already met, which returns the name and still nothing else.';

comment on view public.member_engagement is
  'The counts that sit beside a member. Runs as its owner to see past "own profile or staff" on profiles and "own passes or staff" on passes, and past the Open Deck and knots reads behind them; as the caller it would return the caller and no one else. Each column decides for itself who is owed it.';

comment on view public.member_league is
  'Which league a member has reached. Runs as its owner to see past "own profile or staff" on profiles -- leagues itself is public reading, profiles is not -- and blanks the league for anyone the caller is not owed.';

comment on view public.own_counter_signature is
  'Your own countersignature, without the officer''s address or user agent. Runs as its owner to see past "staff read counter-signatures" on counter_signatures: RLS cannot withhold a column, so the base table is staff-only and this view is the half a member is owed.';

comment on view public.own_vetting_state is
  'A member''s own vetting state and nothing else. Runs as its owner to see past "the vetting file is the vetting team''s" on vetting_files: the file is theirs, and this is the half a member is owed.';

-- The second class. producer_turns and status_lookups have no primary key.
-- Both are append-only tallies behind a pacing gate, written by the definer
-- functions that pace the Producer, the application status page, the apply and
-- crew forms, and the door check -- and swept by those same functions on the
-- way in. Nothing addresses a row.
--
-- No natural key is available, and that is not a detail. asked_at and looked_at
-- default to now(), which is the transaction's start time, so two rows can
-- honestly share one: the apply and crew gates each write two lookup rows in a
-- single transaction, and two callers who arrive together take the same
-- reading. A key over (fingerprint, looked_at) would turn a pacing ledger into
-- a duplicate-key error, and the person checking on their application would
-- read a Postgres string instead of a sentence. So the key has to be a
-- surrogate or there is no key.
--
-- It gets one. The cost is a small index on a table that holds a few hundred
-- rows for an hour; what it buys is a replica identity. Both tables are
-- DELETEd from inside the gate that paces the caller, and adding either to a
-- publication is one switch away -- after which every one of those DELETEs
-- fails for want of a replica identity, and the failure lands on whoever was
-- only checking where they stood.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.producer_turns'::regclass and contype = 'p'
  ) then
    alter table public.producer_turns add column id bigint generated always as identity;
    alter table public.producer_turns add constraint producer_turns_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.status_lookups'::regclass and contype = 'p'
  ) then
    alter table public.status_lookups add column id bigint generated always as identity;
    alter table public.status_lookups add constraint status_lookups_pkey primary key (id);
  end if;
end $$;

comment on table public.producer_turns is
  'One row per question put to the Producer. Written only by take_a_producer_turn; nobody reads it but the Bridge. The id is a surrogate and no caller addresses a row by it -- it exists so the sweep has a replica identity, since asked_at defaults to now() and is not unique enough to key on.';

comment on table public.status_lookups is
  'Pacing ledger for the status page, the apply and crew forms, and the door check. Written only by the definer gates that gate those; nobody reads it but the Bridge. The id is a surrogate and no caller addresses a row by it -- it exists so the sweep has a replica identity, since looked_at defaults to now() and two rows in one transaction share it.';
