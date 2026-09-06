-- The trigram indexes landed in
-- 20260906030000_the_bridge_search_reads_an_index_not_the_whole_club.sql and
-- that migration closed by admitting what it could not fix: a two-character
-- needle. pg_trgm extracts no trigram from a two-character pattern, so the GIN
-- index has nothing to look up and the planner falls back to the sequential
-- scan it did before. Measured again here on the same corpus at the same club
-- scale — 10 000 members, 2 000 episodes, 5 000 applications, 3 000 crew
-- candidates, 2 000 codes — the members arm of a two-character search is:
--
--   Seq Scan on profiles, 2 781 of 10 001 rows kept, 582 buffers, 18.96 ms
--
-- against 93 buffers and 0.94 ms for 'rossi' through the trigram index. After
-- this migration the same arm is a BitmapOr over four btree prefix indexes,
-- 52 buffers and 0.907 ms, with the index condition the planner wants to see:
-- lower(full_name) ~>=~ 'ro' AND lower(full_name) ~<~ 'rp'.
--
-- The whole function, warm cache, fifty calls a needle, old definition and new
-- side by side in the same session:
--
--   'ro'                   19.92 ms  ->   1.46 ms
--   'sy'                   29.66 ms  ->   9.99 ms
--   'be'                   36.56 ms  ->  13.50 ms
--   'ni'                   16.51 ms  ->   0.26 ms
--   'ros'                   1.13 ms  ->   1.19 ms
--   'rossi'                 1.17 ms  ->   1.16 ms
--   'a4242@bench.invalid'   1.70 ms  ->   1.82 ms
--   'SYR-004242'            0.73 ms  ->   0.72 ms
--   'BENCH01234'            0.64 ms  ->   0.61 ms
--   'Night Watch 1500'      0.08 ms  ->   0.08 ms
--
-- 'sy' and 'be' are the honest end of it. Every member number begins SYR- and
-- every seeded handle begins bench, so those two prefixes match the whole
-- table; the index hands over ten thousand rows and the ORDER BY still has to
-- sort them for a LIMIT of six. A prefix that selects nothing is three times
-- faster than the scan and no more. The prefix that selects something — which
-- is what two letters of a name are — is fourteen to sixty times faster.
--
-- So two characters is served as a PREFIX rather than as a substring. That is
-- a different answer, deliberately: 'ro' now finds Rossi and Romano and not
-- Ferreira. Two characters in the middle of a word was never a search anyone
-- meant to run — it is what the box holds on the way to typing the third
-- letter — and a prefix is the reading a person expects of two letters.
-- Three characters and up are untouched, down to the byte.
--
-- Two things had to be worked out before an index could serve it.
--
-- FIRST: ILIKE can never use a btree, whatever operator class it is built
-- with. Postgres extracts an index-usable prefix from a LIKE pattern in
-- like_support.c, and for the case-insensitive operator it stops at the first
-- character whose upper and lower case differ — which for 'ro%' is the first
-- character. So `col ilike 'ro%'` has no fixed prefix, and there is nothing
-- for a btree to range over. The query has to say `lower(col) like 'ro%'`
-- with the needle lowercased by the caller, and the index has to be on
-- lower(col).
--
-- SECOND: this database's collation is en_US.UTF-8, not C. A btree in a
-- non-C collation orders text by collation rules, and LIKE's prefix range is
-- a byte range, so the planner will not use a default-opclass index for LIKE
-- at all. text_pattern_ops is the opclass that orders bytewise and is the one
-- LIKE can range over. Both halves are needed: lower() for the case, and
-- text_pattern_ops for the collation.
--
-- One index per column here, unlike the trigram indexes, which index the
-- columns concatenated. A prefix of a concatenation is a prefix of its first
-- field and of nothing else, so 'sy' would find member numbers and no email
-- addresses. Eleven small btrees, one per column the search already reads.
create index if not exists profiles_prefix_full_name on public.profiles (lower(full_name) text_pattern_ops);
create index if not exists profiles_prefix_email on public.profiles (lower(email) text_pattern_ops);
create index if not exists profiles_prefix_member_no on public.profiles (lower(member_no) text_pattern_ops);
create index if not exists profiles_prefix_handle on public.profiles (lower(handle) text_pattern_ops);
create index if not exists episodes_prefix_title on public.episodes (lower(title) text_pattern_ops);
create index if not exists episodes_prefix_slug on public.episodes (lower(slug) text_pattern_ops);
create index if not exists promo_codes_prefix_code on public.promo_codes (lower(code) text_pattern_ops);
create index if not exists applications_prefix_full_name on public.applications (lower(full_name) text_pattern_ops);
create index if not exists applications_prefix_email on public.applications (lower(email) text_pattern_ops);
create index if not exists crew_candidates_prefix_full_name on public.crew_candidates (lower(full_name) text_pattern_ops);
create index if not exists crew_candidates_prefix_email on public.crew_candidates (lower(email) text_pattern_ops);

-- The two lengths are two branches, not one query with a CASE in its WHERE.
-- A CASE whose condition is only known at execution time hides the pattern
-- from the planner, and an index qual that the planner cannot see is an index
-- that is never used. So the five-way union is written twice: once reading
-- prefixes, once reading substrings. The substring half below is copied
-- character for character from the migration that introduced it — the same
-- columns, the same conjuncts, the same ORDER BY, the same limits, the same
-- href for every hit.
--
-- The pattern reaches the index as a plpgsql parameter rather than as a
-- literal, and a prefix can only be extracted from a literal. plpgsql plans a
-- statement custom (with the parameter substituted) for its first executions
-- and then compares a generic plan against the average custom cost; here the
-- generic plan cannot use the index and so costs more, and the cache keeps
-- choosing the custom plan. Confirmed rather than assumed: fifty consecutive
-- calls of bridge_search('ro') raise the idx_scan counter on all four profile
-- prefix indexes by fifty and leave profiles' seq_scan counter where it was.
create or replace function public.bridge_search(p_q text)
returns table(kind text, id text, title text, subtitle text, href text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  needle text := btrim(coalesce(p_q, ''));
  safe text := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  q text := '%' || safe || '%';
  pfx text := lower(safe) || '%';
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if char_length(needle) < 2 then return; end if;

  if char_length(needle) = 2 then
    return query
    (select 'member'::text, p.id::text, coalesce(p.full_name, 'A member'), coalesce(p.member_no, '') || case when p.email is not null then ' · ' || p.email else '' end, '/bridge/members?q=' || replace(coalesce(p.member_no, p.email, p.full_name, ''), ' ', '%20')
       from public.profiles p
      where lower(p.full_name) like pfx or lower(p.email) like pfx
         or lower(p.member_no) like pfx or lower(p.handle) like pfx
      order by p.status = 'active' desc, p.full_name limit 6)
    union all
    (select 'episode'::text, e.id::text, e.title, to_char(e.starts_at at time zone coalesce(e.time_zone, 'America/New_York'), 'Dy DD Mon HH24:MI') || ' · ' || e.status::text, '/bridge/episodes?q=' || replace(e.title, ' ', '%20')
       from public.episodes e
      where lower(e.title) like pfx or lower(e.slug) like pfx
      order by e.starts_at desc limit 6)
    union all
    (select 'code'::text, c.code, c.code, c.kind || ' · ' || c.uses || '/' || c.max_uses || case when c.active then '' else ' · off' end, '/bridge/codes?q=' || c.code
       from public.promo_codes c
      where lower(c.code) like pfx
      order by c.created_at desc limit 4)
    union all
    (select 'application'::text, a.id::text, a.full_name, a.status || ' · ' || a.email, '/bridge?q=' || replace(a.email, ' ', '%20')
       from public.applications a
      where lower(a.full_name) like pfx or lower(a.email) like pfx
      order by a.created_at desc limit 4)
    union all
    (select 'crew'::text, cc.id::text, cc.full_name, coalesce(cc.stage, '') || ' · ' || cc.email, '/bridge/crew?q=' || replace(cc.email, ' ', '%20')
       from public.crew_candidates cc
      where lower(cc.full_name) like pfx or lower(cc.email) like pfx
      order by cc.created_at desc limit 4);
    return;
  end if;

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
