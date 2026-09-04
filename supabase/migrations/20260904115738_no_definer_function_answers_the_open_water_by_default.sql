-- Nine SECURITY DEFINER functions were created with "grant to authenticated"
-- and never "revoke from public", so PUBLIC — and therefore anon — still holds
-- EXECUTE from the default. Each happens to re-check the caller, which is why
-- nothing leaked, and why the gate never noticed: security_report checks
-- trigger functions and nothing else for EXECUTE. Revoke, grant explicitly,
-- and make the report say so from now on.
revoke execute on function public.calendar_feed(uuid) from public;
revoke execute on function public.claimed_cabins(uuid[]) from public, anon;
revoke execute on function public.club_setting(text) from public;
revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.incoming_transfers() from public, anon;
revoke execute on function public.passes_left(uuid, uuid) from public;
revoke execute on function public.requeue_outbox_row(text, uuid) from public, anon;
revoke execute on function public.scheduler_health(integer) from public, anon;
revoke execute on function public.segment_heads(text) from public;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
grant execute on function public.club_setting(text) to anon, authenticated;
grant execute on function public.passes_left(uuid, uuid) to anon, authenticated;
grant execute on function public.segment_heads(text) to anon, authenticated;
grant execute on function public.claimed_cabins(uuid[]) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.incoming_transfers() to authenticated;
grant execute on function public.requeue_outbox_row(text, uuid) to authenticated;
grant execute on function public.scheduler_health(integer) to authenticated;

do $$
declare src text; anchor text := E'  return query\n  select ''anon_policy_calls_only_granted_fns'',';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'security_report' and p.pronamespace = 'public'::regnamespace;
  if position(anchor in src) = 0 then
    raise exception 'security_report lost its anon-policy check anchor — re-read it before patching';
  end if;
  src := replace(src, anchor,
$p$  -- A definer function must never carry the default PUBLIC EXECUTE: every
  -- grant to anon or authenticated is written out, so the report can read it.
  return query
  select 'definer_fn_not_public', p.proname::text,
         not has_function_privilege('public', p.oid, 'execute'),
         case when has_function_privilege('public', p.oid, 'execute')
              then 'PUBLIC holds EXECUTE' else 'explicit grants only' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef;

$p$ || anchor);
  execute src;
end $$;

do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
    and has_function_privilege('public', p.oid, 'execute');
  if bad is not null then raise exception 'PUBLIC still executes: %', bad; end if;
end $$;;
