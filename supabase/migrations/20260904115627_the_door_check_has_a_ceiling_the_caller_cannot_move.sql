-- email_may_board and application_status_for throttle by a fingerprint the
-- caller supplies, so the per-source cap is the caller's to reset; only the
-- per-address cap is real, and that permits enumerating addresses at ten tries
-- each, indefinitely. A ceiling on the whole door is one the caller cannot
-- carry away. Six hundred tries in ten minutes is far past any real gangway.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'email_may_board' and p.pronamespace = 'public'::regnamespace;
  if src not like '%  if asked_here >= 300 then%' then
    raise exception 'email_may_board does not read as expected — trace before patching';
  end if;
  src := replace(src, '  if asked_here >= 300 then',
$p$  if (select count(*) from public.status_lookups
      where fingerprint like 'board:%' and looked_at > now() - interval '10 minutes') >= 600 then
    raise exception 'the door is busy just now — give it a few minutes' using errcode = '53400';
  end if;
  if asked_here >= 300 then$p$);
  execute src;
end $$;;
