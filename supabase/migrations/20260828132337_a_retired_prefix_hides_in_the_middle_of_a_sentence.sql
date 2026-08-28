-- The invariant in 20260825194203 swept every text column and reported clean,
-- and it was wrong. It matched `like 'SYR-%'` — which anchors at the START of
-- the value — so it saw boarding codes and member numbers, and walked straight
-- past every sentence that CONTAINS one:
--
--   "Your code is SYR-REGA-0905-0029. Guests are yours to name again."
--
-- Those are notification bodies sitting in members' inboxes. A prefix is a
-- prefix of the CODE, not of the column, and the check confused the two. It is
-- the third pattern of mine today that looked complete and was not; the other
-- two were a '%@syrius.social' that could not see a demo. subdomain, and a
-- case-sensitive grep that walked past a lowercase tagline in live page copy.
update public.notifications
   set body  = replace(replace(body,  'SYR-', 'UN-'), 'LYR-', 'UN-'),
       title = replace(replace(title, 'SYR-', 'UN-'), 'LYR-', 'UN-')
 where body like '%SYR-%' or body like '%LYR-%' or title like '%SYR-%' or title like '%LYR-%';

update public.push_outbox
   set body  = replace(replace(body,  'SYR-', 'UN-'), 'LYR-', 'UN-'),
       title = replace(replace(title, 'SYR-', 'UN-'), 'LYR-', 'UN-')
 where body like '%SYR-%' or body like '%LYR-%' or title like '%SYR-%' or title like '%LYR-%';

update public.email_outbox
   set payload = replace(replace(payload::text, 'SYR-', 'UN-'), 'LYR-', 'UN-')::jsonb
 where payload::text like '%SYR-%' or payload::text like '%LYR-%';

-- The corrected invariant: anywhere in the value, not just at the start.
-- clause_versions stays exempt — append-only legal text, superseded rather
-- than edited.
do $$
declare c record; n bigint; left_over text := '';
begin
  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type in ('text', 'character varying')
       and table_name <> 'clause_versions'
  loop
    begin
      execute format(
        $q$select count(*) from public.%I where %I ~* '(\msyrius\M|\mlyre\M)' or %I like '%%SYR-%%' or %I like '%%LYR-%%'$q$,
        c.table_name, c.column_name, c.column_name, c.column_name, c.column_name) into n;
      if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
    exception when others then null;
    end;
  end loop;
  if left_over <> '' then
    raise exception 'a retired brand is still in the records:%', left_over;
  end if;
end $$;;
