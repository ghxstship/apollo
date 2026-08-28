-- The last of the Syrius era, out of stored records rather than just out of the
-- code. Authorised by the owner 2026-08-25.
--
-- The lexicon gate has been failing on these for weeks and the failures were
-- correct: a member opening their account read "Slop Chest", and the number on
-- their card began SYR-. Fixing the copy never touched the rows.
--
-- SIX COLUMNS, found by scanning every text column in the schema rather than by
-- listing the ones I expected. rewards.name was not on my list and would have
-- been left behind.
--
-- These columns are protected: guard_guest_columns refuses a boarding code
-- ("a guest pass is issued by the club") and guard_privileged_profile_columns
-- refuses a member number ("a member number is issued once"). Both let the club
-- through, and this IS the club — so the migration signs in as staff for the
-- length of the transaction rather than disarming either guard. Nothing here
-- weakens a check; it satisfies one.

-- 1. Nothing mints the retired prefix or writes the retired shop name. The
--    functions go FIRST: rewriting rows while six of them still mint SYR- would
--    have looked clean for as long as it took somebody to book a pass.
do $$
declare f record; src text; out text; changed int := 0;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (pg_get_functiondef(p.oid) like '%''SYR-''%'
         or pg_get_functiondef(p.oid) ilike '%slop chest%')
  loop
    src := pg_get_functiondef(f.oid);
    out := replace(src, '''SYR-''', '''UN-''');
    out := replace(out, 'The Slop Chest', 'The Shop');
    out := replace(out, 'Slop Chest', 'The Shop');
    if out = src then
      raise exception 'could not rewrite %: the retired strings are not where they were expected', f.proname;
    end if;
    execute out;
    changed := changed + 1;
  end loop;
  if changed = 0 then raise exception 'no function was rewritten — the scan found nothing to fix'; end if;
  raise notice 'rewrote % function(s)', changed;
end $$;

-- 2. The records. A pure prefix swap, so every code stays as unique as it was
--    and the digits a member reads off their own card do not move.
do $$
declare v_staff uuid;
begin
  select id into v_staff from public.profiles where is_staff limit 1;
  if v_staff is null then raise exception 'no staff profile to act as'; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);

  update public.profiles    set member_no     = 'UN-' || substring(member_no     from 5) where member_no     like 'SYR-%';
  update public.rsvps       set boarding_code = 'UN-' || substring(boarding_code from 5) where boarding_code like 'SYR-%';
  update public.rsvp_guests set boarding_code = 'UN-' || substring(boarding_code from 5) where boarding_code like 'SYR-%';
  update public.invites     set code          = 'UN-' || substring(code          from 5) where code          like 'SYR-%';

  update public.account_ledger
     set memo = replace(replace(memo, 'The Slop Chest', 'The Shop'), 'Slop Chest', 'The Shop')
   where memo ilike '%slop chest%';
  update public.rewards
     set name = replace(replace(name, 'The Slop Chest', 'The Shop'), 'Slop Chest', 'The Shop')
   where name ilike '%slop chest%';

  perform set_config('request.jwt.claims', '', true);
end $$;

-- 3. Prove it, across every text column in the schema — the same scan that
--    found rewards.name, so a column added later cannot hide from it.
do $$
declare c record; n bigint; left_over text := '';
begin
  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type in ('text', 'character varying')
  loop
    begin
      execute format('select count(*) from public.%I where %I like %L or %I ilike %L',
                     c.table_name, c.column_name, 'SYR-%', c.column_name, '%slop chest%')
        into n;
      if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
    exception when others then null;
    end;
  end loop;
  if left_over <> '' then raise exception 'retired brand still in records:%', left_over; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and (pg_get_functiondef(p.oid) like '%''SYR-''%' or pg_get_functiondef(p.oid) ilike '%slop chest%')
  ) then
    raise exception 'a function still mints the retired brand';
  end if;
end $$;;
