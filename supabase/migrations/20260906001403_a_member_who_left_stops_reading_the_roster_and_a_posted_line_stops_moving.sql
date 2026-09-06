-- Three things a crawl found, each verified against live before it was touched.

-- 1 ── WHO MAY BROWSE.
-- member_directory, member_engagement and member_league each gate carefully on
-- what a given ROW may reveal — in_directory and status = 'active' decide
-- whether a name, a handle, a city is returned. Every one of them then gates
-- the VIEWER with nothing but `auth.uid() is not null`. episode_manifest does
-- the same: `if auth.uid() is null then raise`.
--
-- So the question "may this person browse the club?" was only ever "do they
-- hold any session at all?". A member who departs keeps their auth user, and
-- with it the full roster — every name, handle, tier, home city, bio, interest
-- and join date — plus who is aboard every future episode. Leaving the club
-- did not close the book.
--
-- Departed is the unambiguous case and the one this closes. Whether a PAUSED
-- member should keep the roster is a product decision, not a defect: the hold
-- copy names booking, posting and contests, and says nothing about reading. So
-- paused keeps its access here and the question goes to the owner rather than
-- being answered by a migration.
create or replace function public.viewer_may_browse()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.status, '') <> 'departed'
  );
$fn$;

revoke all on function public.viewer_may_browse() from public, anon;
grant execute on function public.viewer_may_browse() to authenticated;

comment on function public.viewer_may_browse() is
  'May the caller read the club''s own records at all. Signed in AND not departed. The row-level questions — in_directory, status, staff — are asked separately and still are; this is only the door.';

create or replace view public.member_directory with (security_invoker = false) as
 SELECT id,
        CASE WHEN in_directory AND status = 'active'::text THEN member_no ELSE NULL::text END AS member_no,
        CASE WHEN in_directory AND status = 'active'::text OR shares_ground_with(id) THEN full_name ELSE 'A member'::text END AS full_name,
        CASE WHEN in_directory AND status = 'active'::text THEN handle ELSE NULL::text END AS handle,
        CASE WHEN in_directory AND status = 'active'::text THEN tier ELSE NULL::membership_tier END AS tier,
        CASE WHEN in_directory AND status = 'active'::text THEN home_city ELSE NULL::uuid END AS home_city,
    avatar_tone,
    is_staff,
        CASE WHEN in_directory AND status = 'active'::text THEN joined_at ELSE NULL::timestamp with time zone END AS joined_at,
        CASE WHEN in_directory AND status = 'active'::text THEN status ELSE NULL::text END AS status,
        CASE WHEN in_directory AND status = 'active'::text THEN bio ELSE NULL::text END AS bio,
    in_directory,
        CASE WHEN in_directory AND status = 'active'::text THEN interests ELSE NULL::text[] END AS interests
   FROM profiles p
  WHERE public.viewer_may_browse();

create or replace view public.member_engagement with (security_invoker = false) as
 SELECT id AS profile_id,
        CASE WHEN viewer_is_staff() OR id = auth.uid() OR in_directory AND status = 'active'::text THEN ((
            SELECT count(*) AS count FROM passes r WHERE r.profile_id = p.id AND r.status = 'aboard'::pass_status))::integer
            ELSE NULL::integer END AS passes,
        CASE WHEN viewer_is_staff() THEN ((
            SELECT count(*) AS count FROM passes r WHERE r.profile_id = p.id AND r.checked_in_at IS NOT NULL))::integer
            ELSE NULL::integer END AS attended,
        CASE WHEN viewer_is_staff() THEN ((
            SELECT count(*) AS count FROM open_deck_posts w WHERE w.author_id = p.id))::integer
            ELSE NULL::integer END AS posts,
        CASE WHEN viewer_is_staff() OR id = auth.uid() THEN ((
            SELECT COALESCE(sum(f.delta), 0::bigint) AS "coalesce" FROM knots_ledger f WHERE f.profile_id = p.id))::integer
            ELSE NULL::integer END AS knots,
        CASE WHEN viewer_is_staff() THEN (
            SELECT max(r.created_at) AS max FROM passes r WHERE r.profile_id = p.id)
            ELSE NULL::timestamp with time zone END AS last_booked_at
   FROM profiles p
  WHERE public.viewer_may_browse();

create or replace view public.member_league with (security_invoker = false) as
 SELECT p.id AS profile_id,
        CASE WHEN NOT (viewer_is_staff() OR p.id = auth.uid() OR p.in_directory AND p.status = 'active'::text)
             THEN NULL::integer ELSE l.league::integer END AS league,
        CASE WHEN NOT (viewer_is_staff() OR p.id = auth.uid() OR p.in_directory AND p.status = 'active'::text)
             THEN NULL::text ELSE l.name END AS league_name
   FROM profiles p
     LEFT JOIN LATERAL ( SELECT lg.league, lg.name
           FROM leagues lg
          WHERE p.joined_at <= (now() - make_interval(months => lg.months))
          ORDER BY lg.months DESC
         LIMIT 1) l ON true
  WHERE public.viewer_may_browse();

-- episode_manifest, by surgery rather than retyping: the body is long and the
-- only thing changing is the door. The anchor is asserted so a body that has
-- moved on fails loudly here instead of being silently half-patched.
do $surgery$
declare src text; anchor text := 'if auth.uid() is null then';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'episode_manifest';
  if src is null then raise exception 'episode_manifest is gone'; end if;
  if position(anchor in src) = 0 then
    raise exception 'episode_manifest no longer opens with the signed-in check — look before patching';
  end if;
  src := replace(src, anchor, 'if not public.viewer_may_browse() then');
  src := replace(src, '''sign in first''', '''sign in first''');
  execute src;
end $surgery$;

-- 2 ── A POSTED LINE STOPS MOVING.
-- a_refund_never_exceeds_its_payment fires BEFORE INSERT only, so the cap was
-- a question asked once. Nothing stopped a later UPDATE from changing
-- delta_cents to any number at all, and the ledger carried no immutability
-- guard of the kind signatures and clause_versions have had since August.
--
-- The money-bearing facts are frozen. memo stays editable — the corpus has
-- renamed the club's vocabulary in it twice and will again. DELETE is left
-- alone deliberately: account_ledger has no DELETE policy, so a client's
-- delete is already a silent no-op, and turning that silence into an exception
-- would break every sweep that has always harmlessly asked.
create or replace function public.a_posted_line_does_not_move()
returns trigger
language plpgsql
as $fn$
begin
  if new.delta_cents is distinct from old.delta_cents
     or new.kind is distinct from old.kind
     or new.stripe_ref is distinct from old.stripe_ref
     or new.profile_id is distinct from old.profile_id then
    raise exception 'a posted line does not move: correct it with another line';
  end if;
  return new;
end $fn$;

drop trigger if exists a_posted_line_does_not_move on public.account_ledger;
create trigger a_posted_line_does_not_move
  before update on public.account_ledger
  for each row execute function public.a_posted_line_does_not_move();

-- 3 ── An episode cannot end before it starts.
-- Every other starts/ends pair in the schema carries this check; episodes was
-- the one that did not. Zero rows violate it today.
alter table public.episodes drop constraint if exists an_episode_ends_after_it_starts;
alter table public.episodes add constraint an_episode_ends_after_it_starts
  check (ends_at is null or starts_at is null or ends_at > starts_at);;
