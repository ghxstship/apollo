-- member_engagement, member_league and member_affinity are security_invoker
-- views over rsvps and profiles, which RLS scopes to the caller's own rows. So
-- every member on /directory read "0 PASSES · First League", and a profile page
-- said "SAILED TOGETHER ×0" directly above "You've both sailed: Season II
-- regatta, day one." — the Passage Log beside it was right because it comes
-- from a definer RPC. The screens were counting what the viewer could see
-- rather than what is there.
--
-- These become definers. league is derived from joined_at alone and says
-- nothing private. engagement is trimmed to what the directory actually shows —
-- passes — because attended, posts, knots and last_booked_at are the Bridge's
-- business, and a definer must not hand them to every member. affinity scopes
-- itself to the caller, which is the only row that was ever theirs.
create or replace view public.member_league
with (security_invoker = false) as
  select id as profile_id,
         case
           when joined_at > (now() - interval '6 mons')  then 1
           when joined_at > (now() - interval '1 year')  then 2
           when joined_at > (now() - interval '2 years') then 3
           when joined_at > (now() - interval '4 years') then 4
           else 5
         end as league,
         case
           when joined_at > (now() - interval '6 mons')  then 'First League — Harborline'
           when joined_at > (now() - interval '1 year')  then 'Second League — Soundings'
           when joined_at > (now() - interval '2 years') then 'Third League — Blue Water'
           when joined_at > (now() - interval '4 years') then 'Fourth League — Deep Water'
           else 'Fifth League — The Trench'
         end as league_name
  from public.profiles
  where auth.uid() is not null;

create or replace view public.member_engagement
with (security_invoker = false) as
  select p.id as profile_id,
         (select count(*) from public.rsvps r
           where r.profile_id = p.id and r.status = 'aboard')::int as passes,
         -- Staff-only detail stays staff-only.
         case when public.is_staff() then
           (select count(*) from public.rsvps r
             where r.profile_id = p.id and r.checked_in_at is not null)::int
         end as attended,
         case when public.is_staff() then
           (select count(*) from public.wardroom_posts w where w.author_id = p.id)::int
         end as posts,
         case when public.is_staff() or p.id = auth.uid() then
           (select coalesce(sum(f.delta), 0) from public.fathoms_ledger f
             where f.profile_id = p.id)::int
         end as knots,
         case when public.is_staff() then
           (select max(r.created_at) from public.rsvps r where r.profile_id = p.id)
         end as last_booked_at
  from public.profiles p
  where auth.uid() is not null;

create or replace view public.member_affinity
with (security_invoker = false) as
  select a.profile_id,
         b.profile_id as other_id,
         count(*)::int as shared
  from public.rsvps a
  join public.rsvps b on b.voyage_id = a.voyage_id and b.profile_id <> a.profile_id
  where a.status = 'aboard' and b.status = 'aboard'
    and (a.profile_id = auth.uid() or public.is_staff())
  group by a.profile_id, b.profile_id;

revoke all on public.member_league, public.member_engagement, public.member_affinity
  from anon, authenticated;
grant select on public.member_league, public.member_engagement, public.member_affinity
  to authenticated;

do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src,
    'or c.relname in (''voyage_capacity'', ''member_directory'', ''own_counter_signature'', ''agreement_standing'')',
    'or c.relname in (''voyage_capacity'', ''member_directory'', ''own_counter_signature'', ''agreement_standing'', ''member_league'', ''member_engagement'', ''member_affinity'')');

  if newsrc = src then
    raise exception 'view_security_invoker whitelist not found — check security_report';
  end if;
  execute newsrc;
end $$;;
