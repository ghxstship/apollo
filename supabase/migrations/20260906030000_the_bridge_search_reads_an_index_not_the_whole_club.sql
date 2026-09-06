-- bridge_search fires on every keystroke on the Bridge and LIKE-scans five
-- tables with a leading wildcard, which no btree can serve. There were no GIN
-- or GIST indexes in public at all and pg_trgm was not installed, so every
-- keypress was five sequential scans. Measured on a replayed corpus seeded to
-- 10 000 members, 2 000 episodes, 5 000 applications, 3 000 crew candidates and
-- 2 000 codes: 23-27 ms and ~510 shared buffers per keystroke, whatever was
-- typed.
--
-- One index per table rather than one per column. A four-way BitmapOr over
-- four per-column GIN indexes costs four GIN startups, and the planner rightly
-- refused it for anything but the shortest needles — with per-column indexes a
-- full email address still chose the sequential scan. Indexing the columns
-- concatenated gives one index scan, and the per-column OR is kept as a second
-- conjunct so the answer does not change: if a needle is a substring of one
-- column it is a substring of the concatenation, so the index predicate is a
-- strict superset and the OR removes the cross-column matches the join would
-- otherwise invent. Checked row-for-row against seventeen needles including
-- ones that straddle a field boundary; identical counts every time.
--
--   'rossi'                23.6 ms / 510 buf  ->  1.5 ms / 337 buf
--   'a4242@bench.invalid'  26.6 ms / 510 buf  ->  6.1 ms / 274 buf
--   'SYR-004242'           25.7 ms / 507 buf  ->  1.2 ms / 117 buf
--   'elena rossi 42'       25.9 ms / 507 buf  ->  3.0 ms / 165 buf
--   'BENCH01234'           26.0 ms / 507 buf  ->  1.3 ms / 112 buf
--   'Night Watch 1500'     27.0 ms / 507 buf  ->  5.7 ms / 195 buf
--
-- A two-character needle is unchanged and cannot be helped: pg_trgm extracts no
-- trigram from a two-character pattern, so the planner falls back to the scan
-- it already did. The function's floor is two characters; raising it to three
-- is the owner's call, not a migration's.
create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_bridge_search_trgm on public.profiles using gin (
  (coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' ||
   coalesce(member_no, '') || ' ' || coalesce(handle, ''))
  extensions.gin_trgm_ops);

create index if not exists episodes_bridge_search_trgm on public.episodes using gin (
  (title || ' ' || slug) extensions.gin_trgm_ops);

create index if not exists promo_codes_bridge_search_trgm on public.promo_codes using gin (
  code extensions.gin_trgm_ops);

create index if not exists applications_bridge_search_trgm on public.applications using gin (
  (full_name || ' ' || email) extensions.gin_trgm_ops);

create index if not exists crew_candidates_bridge_search_trgm on public.crew_candidates using gin (
  (full_name || ' ' || email) extensions.gin_trgm_ops);

-- Same function, same answers, same href for every hit. The only change is the
-- indexable conjunct in front of each WHERE.
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
    where (coalesce(p.full_name, '') || ' ' || coalesce(p.email, '') || ' ' ||
           coalesce(p.member_no, '') || ' ' || coalesce(p.handle, '')) ilike q
      and (p.full_name ilike q or p.email ilike q or p.member_no ilike q or p.handle ilike q)
    order by p.status = 'active' desc, p.full_name limit 6)
  union all
  (select 'episode'::text, e.id::text, e.title, to_char(e.starts_at at time zone coalesce(e.time_zone, 'America/New_York'), 'Dy DD Mon HH24:MI') || ' · ' || e.status::text, '/bridge/episodes?q=' || replace(e.title, ' ', '%20')
     from public.episodes e
    where (e.title || ' ' || e.slug) ilike q
      and (e.title ilike q or e.slug ilike q)
    order by e.starts_at desc limit 6)
  union all
  (select 'code'::text, c.code, c.code, c.kind || ' · ' || c.uses || '/' || c.max_uses || case when c.active then '' else ' · off' end, '/bridge/codes?q=' || c.code
     from public.promo_codes c
    where c.code ilike q
    order by c.created_at desc limit 4)
  union all
  (select 'application'::text, a.id::text, a.full_name, a.status || ' · ' || a.email, '/bridge?q=' || replace(a.email, ' ', '%20')
     from public.applications a
    where (a.full_name || ' ' || a.email) ilike q
      and (a.full_name ilike q or a.email ilike q)
    order by a.created_at desc limit 4)
  union all
  (select 'crew'::text, cc.id::text, cc.full_name, coalesce(cc.stage, '') || ' · ' || cc.email, '/bridge/crew?q=' || replace(cc.email, ' ', '%20')
     from public.crew_candidates cc
    where (cc.full_name || ' ' || cc.email) ilike q
      and (cc.full_name ilike q or cc.email ilike q)
    order by cc.created_at desc limit 4);
end $function$;
