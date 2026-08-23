-- The member views call is_staff() in their select list, and is_staff() is
-- deliberately not executable by anon — so anon got 42501 "permission denied
-- for function" instead of the empty result a sealed relation must return.
-- Granting anon is_staff() would widen a boundary that is drawn on purpose.
--
-- A wrapper anon may call, which answers the only thing anon can truthfully be
-- told: no. is_staff() itself stays where it is.
create or replace function public.viewer_is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then return false; end if;
  return public.is_staff();
end;
$$;

revoke execute on function public.viewer_is_staff() from public;
grant execute on function public.viewer_is_staff() to anon, authenticated;

create or replace view public.member_engagement
with (security_invoker = false) as
  select p.id as profile_id,
         (select count(*) from public.rsvps r
           where r.profile_id = p.id and r.status = 'aboard')::int as passes,
         case when public.viewer_is_staff() then
           (select count(*) from public.rsvps r
             where r.profile_id = p.id and r.checked_in_at is not null)::int
         end as attended,
         case when public.viewer_is_staff() then
           (select count(*) from public.wardroom_posts w where w.author_id = p.id)::int
         end as posts,
         case when public.viewer_is_staff() or p.id = auth.uid() then
           (select coalesce(sum(f.delta), 0) from public.fathoms_ledger f
             where f.profile_id = p.id)::int
         end as knots,
         case when public.viewer_is_staff() then
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
    and (a.profile_id = auth.uid() or public.viewer_is_staff())
  group by a.profile_id, b.profile_id;

revoke all on public.member_engagement, public.member_affinity from anon, authenticated;
grant select on public.member_engagement, public.member_affinity to anon, authenticated;;
