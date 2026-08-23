-- Two invariants caught two mistakes of my own, which is what they are for.
--
-- 1. member_directory carried no row rule, so a member could query it straight
--    through PostgREST and read the bio and interests of members who set
--    in_directory = false — the opt-out was enforced only by a .eq() in the
--    directory page's query. A name, handle, member number and tier are already
--    visible to a fellow member on any post or thread, so those stay; what the
--    directory itself collects is withheld unless the member opted in.
--
-- 2. The view is deliberately NOT security_invoker: it is the mechanism that
--    gives profiles the column granularity RLS cannot. Under invoker rights it
--    would inherit "own profile or staff" and return a single row. So it joins
--    voyage_capacity as a reviewed exception in the invariant.
create or replace view public.member_directory
with (security_invoker = off) as
  select
    p.id,
    p.member_no,
    p.full_name,
    p.handle,
    p.tier,
    p.home_harbor,
    p.avatar_tone,
    p.is_staff,
    p.joined_at,
    p.status,
    case when p.in_directory and p.status = 'active' then p.bio else null end       as bio,
    p.in_directory,
    case when p.in_directory and p.status = 'active' then p.interests else null end as interests,
    p.on_camera
  from public.profiles p
  where auth.uid() is not null;

revoke all on public.member_directory from public, anon;
grant select on public.member_directory to authenticated;

comment on view public.member_directory is
  'What one member may see of another. Explicit column list — email, phone, calendar_token, stripe_customer_id and plan never appear here.';

revoke execute on function public.unverify_on_phone_change() from public, anon, authenticated;

do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src,
    'or c.relname = ''voyage_capacity''',
    'or c.relname in (''voyage_capacity'', ''member_directory'')');

  if newsrc = src then
    raise exception 'view_security_invoker whitelist not found — check security_report';
  end if;
  execute newsrc;
end $$;
