-- own_counter_signature is deliberately a definer view: it exists precisely
-- because the base table is now staff-only, and it filters on auth.uid()
-- itself. The invariant is right to make that a decision someone has to write
-- down rather than a default.
do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src,
    'or c.relname in (''voyage_capacity'', ''member_directory'')',
    'or c.relname in (''voyage_capacity'', ''member_directory'', ''own_counter_signature'')');

  if newsrc = src then
    raise exception 'view_security_invoker whitelist not found — check security_report';
  end if;
  execute newsrc;
end $$;;
