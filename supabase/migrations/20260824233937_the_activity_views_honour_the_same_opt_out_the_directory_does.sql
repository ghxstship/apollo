-- member_directory is careful: an unlisted or non-active member gets a null
-- member number, no handle, no tier, no harbour, no joined_at. Two views beside
-- it are not, and all three are security_invoker=false, so RLS on profiles never
-- applies and their only gate is "is somebody signed in".
--
--   member_engagement.passes — how many sailings each member has boarded, for
--   EVERY profile including the ones that asked not to be listed. How often
--   somebody turns up is a fact about them.
--
--   member_league — a tenure bucket computed from joined_at, for every profile.
--   member_directory deliberately nulls joined_at for an unlisted member; this
--   view handed out the bucket derived from it anyway. The careful thing and
--   the careless thing sat side by side reading the same column.
--
-- Both take the directory's own predicate now, plus self and staff. The
-- /directory pages only ever render listed members, so nothing on screen
-- changes; what changes is what the API will answer.
--
-- And member_directory stops publishing ON_CAMERA. Whether a member has
-- withdrawn from the cameras is among the most personal facts this club holds —
-- it is the subject of a clause they signed — and opting into the directory was
-- not consent to publish it to everyone signed in. Nothing member-facing reads
-- it; the staff crew sheet reads profiles directly, which is where it belongs.
--
-- Dropped and recreated rather than replaced, because a column cannot be
-- removed from a view in place. Grants and security_invoker restored
-- explicitly, and read back in the same migration rather than assumed.
drop view if exists public.member_directory;
create view public.member_directory
with (security_invoker = false) as
select
  id,
  case when in_directory and status = 'active'::text then member_no else null::text end as member_no,
  case when (in_directory and status = 'active'::text) or shares_ground_with(id) then full_name else 'A member'::text end as full_name,
  case when in_directory and status = 'active'::text then handle else null::text end as handle,
  case when in_directory and status = 'active'::text then tier else null::membership_tier end as tier,
  case when in_directory and status = 'active'::text then home_harbor else null::uuid end as home_harbor,
  avatar_tone,
  is_staff,
  case when in_directory and status = 'active'::text then joined_at else null::timestamptz end as joined_at,
  case when in_directory and status = 'active'::text then status else null::text end as status,
  case when in_directory and status = 'active'::text then bio else null::text end as bio,
  in_directory,
  case when in_directory and status = 'active'::text then interests else null::text[] end as interests
from public.profiles p
where auth.uid() is not null;

drop view if exists public.member_engagement;
create view public.member_engagement
with (security_invoker = false) as
select
  id as profile_id,
  case
    when viewer_is_staff() or id = auth.uid() or (in_directory and status = 'active'::text)
      then ((select count(*) from public.rsvps r where r.profile_id = p.id and r.status = 'aboard'::rsvp_status))::integer
    else null::integer
  end as passes,
  case when viewer_is_staff()
    then ((select count(*) from public.rsvps r where r.profile_id = p.id and r.checked_in_at is not null))::integer
    else null::integer end as attended,
  case when viewer_is_staff()
    then ((select count(*) from public.wardroom_posts w where w.author_id = p.id))::integer
    else null::integer end as posts,
  case when viewer_is_staff() or id = auth.uid()
    then ((select coalesce(sum(f.delta), 0::bigint) from public.fathoms_ledger f where f.profile_id = p.id))::integer
    else null::integer end as knots,
  case when viewer_is_staff()
    then (select max(r.created_at) from public.rsvps r where r.profile_id = p.id)
    else null::timestamptz end as last_booked_at
from public.profiles p
where auth.uid() is not null;

drop view if exists public.member_league;
create view public.member_league
with (security_invoker = false) as
select
  id as profile_id,
  case
    when not (viewer_is_staff() or id = auth.uid() or (in_directory and status = 'active'::text)) then null::integer
    when joined_at > (now() - '6 mons'::interval) then 1
    when joined_at > (now() - '1 year'::interval) then 2
    when joined_at > (now() - '2 years'::interval) then 3
    when joined_at > (now() - '4 years'::interval) then 4
    else 5
  end as league,
  case
    when not (viewer_is_staff() or id = auth.uid() or (in_directory and status = 'active'::text)) then null::text
    when joined_at > (now() - '6 mons'::interval) then 'First League — Harborline'::text
    when joined_at > (now() - '1 year'::interval) then 'Second League — Soundings'::text
    when joined_at > (now() - '2 years'::interval) then 'Third League — Blue Water'::text
    when joined_at > (now() - '4 years'::interval) then 'Fourth League — Deep Water'::text
    else 'Fifth League — The Trench'::text
  end as league_name
from public.profiles
where auth.uid() is not null;

grant select on public.member_directory  to anon, authenticated;
grant select on public.member_engagement to anon, authenticated;
grant select on public.member_league     to anon, authenticated;
;
