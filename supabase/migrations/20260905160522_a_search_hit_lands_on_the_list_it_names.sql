-- The Bridge's episode list filters by title, not slug; the search hit's door
-- must carry the word the list will match. Same function, one href.
create or replace function public.bridge_search(p_q text)
returns table(kind text, id text, title text, subtitle text, href text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare q text := '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if char_length(btrim(coalesce(p_q, ''))) < 2 then return; end if;
  return query
  (select 'member'::text, p.id::text, coalesce(p.full_name, 'A member'), coalesce(p.member_no, '') || case when p.email is not null then ' · ' || p.email else '' end, '/bridge/members?q=' || replace(coalesce(p.member_no, p.email, p.full_name, ''), ' ', '%20')
     from public.profiles p
    where p.full_name ilike q or p.email ilike q or p.member_no ilike q or p.handle ilike q
    order by p.status = 'active' desc, p.full_name limit 6)
  union all
  (select 'episode'::text, e.id::text, e.title, to_char(e.starts_at at time zone coalesce(e.time_zone, 'America/New_York'), 'Dy DD Mon HH24:MI') || ' · ' || e.status::text, '/bridge/episodes?q=' || replace(e.title, ' ', '%20')
     from public.episodes e
    where e.title ilike q or e.slug ilike q
    order by e.starts_at desc limit 6)
  union all
  (select 'code'::text, c.code, c.code, c.kind || ' · ' || c.uses || '/' || c.max_uses || case when c.active then '' else ' · off' end, '/bridge/codes?q=' || c.code
     from public.promo_codes c
    where c.code ilike q
    order by c.created_at desc limit 4)
  union all
  (select 'application'::text, a.id::text, a.full_name, a.status || ' · ' || a.email, '/bridge?q=' || replace(a.email, ' ', '%20')
     from public.applications a
    where a.full_name ilike q or a.email ilike q
    order by a.created_at desc limit 4)
  union all
  (select 'crew'::text, cc.id::text, cc.full_name, coalesce(cc.stage, '') || ' · ' || cc.email, '/bridge/crew?q=' || replace(cc.email, ' ', '%20')
     from public.crew_candidates cc
    where cc.full_name ilike q or cc.email ilike q
    order by cc.created_at desc limit 4);
end $function$;;
