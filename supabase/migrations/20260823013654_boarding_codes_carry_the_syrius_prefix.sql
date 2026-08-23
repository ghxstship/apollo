-- Member numbers and invite codes were rebranded LYR- -> SYR-, but boarding
-- codes kept the Lyre-era 'LS-' prefix in three lifecycle functions. Rather
-- than retype functions this critical, each definition is read back, the prefix
-- literal swapped, and the same body re-applied — so nothing else can drift.
do $$
declare
  fn   text;
  src  text;
  newsrc text;
begin
  foreach fn in array array['accept_pass_transfer', 'handle_rsvp_aboard', 'sync_guest_rows'] loop
    select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn and p.prokind = 'f'
    limit 1;

    if src is null then
      raise notice 'no such function: %', fn;
      continue;
    end if;

    newsrc := replace(src, '''LS-', '''SYR-');
    if newsrc = src then
      raise notice 'no prefix found in %', fn;
      continue;
    end if;

    execute newsrc;
    raise notice 'reprefixed %', fn;
  end loop;
end $$;

-- Codes already issued move with them; nothing is printed yet.
update public.rsvps       set boarding_code = replace(boarding_code, 'LS-', 'SYR-') where boarding_code like 'LS-%';
update public.rsvp_guests set boarding_code = replace(boarding_code, 'LS-', 'SYR-') where boarding_code like 'LS-%';
