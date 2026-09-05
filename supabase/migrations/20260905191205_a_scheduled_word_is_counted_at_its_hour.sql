-- A word to nobody is refused only when it would go now. A word queued for an
-- hour ahead is resolved at that hour — the held-for-dues list is empty today
-- and may not be on Tuesday — so the count is the clock's to take.
do $$
declare src text; a1 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'send_broadcast' and p.pronamespace = 'public'::regnamespace;
  a1 := E'  select count(*) into v_reach from public.resolve_broadcast_audience(p_audience);\n  if v_reach = 0 then raise exception ''nobody matches that audience''; end if;';
  if position(a1 in src) = 0 then raise exception 'send_broadcast: anchor missing — re-read before patching'; end if;
  src := replace(src, a1,
    E'  select count(*) into v_reach from public.resolve_broadcast_audience(p_audience);\n  if v_reach = 0 and (p_send_at is null or p_send_at <= now()) then raise exception ''nobody matches that audience''; end if;');
  execute src;
end $$;;
