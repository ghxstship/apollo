/* Two unreachable features made reachable.

   1. phone_verified could never become true: members are (rightly) barred
      from swearing to their own number, and no staff path existed either —
      so the weather-hold SMS the /you page promises was dead code. Crew now
      verify a number they have called or seen answered, through an RPC that
      opens the same app.verify_phone gate the guard already honours. A
      member may always LOWER their own flag (changing your number unverifies
      it; that write used to be refused for a staff-verified member because
      the guard fired before the unverify trigger).

   2. threads.kind allows 'shoreside' and the Bridge console reads that
      queue, but nothing could create such a thread — a concierge desk with
      no door. Members now open (or rejoin) their one live Shoreside thread. */

do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_privileged_profile_columns';
  if src not like '%a number is verified by answering it%' then
    raise exception 'guard_privileged_profile_columns does not look like the function this patch was written for';
  end if;
  patched := replace(src,
$a$  if new.phone_verified is distinct from old.phone_verified
     and coalesce(current_setting('app.verify_phone', true), 'off') <> 'on' then$a$,
$b$  if new.phone_verified is distinct from old.phone_verified
     and new.phone_verified is distinct from false
     and coalesce(current_setting('app.verify_phone', true), 'off') <> 'on' then$b$);
  if patched = src then raise exception 'the phone-guard patch anchored on nothing'; end if;
  execute patched;
end $mig$;

create or replace function public.verify_member_phone(p_profile uuid)
returns void language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if not public.is_staff() then
    raise exception 'a number is verified from the Bridge';
  end if;
  if not exists (select 1 from public.profiles
                 where id = p_profile and coalesce(btrim(phone), '') <> '') then
    raise exception 'there is no number on file to verify — the member adds one on their You page first';
  end if;
  perform set_config('app.verify_phone', 'on', true);
  update public.profiles set phone_verified = true where id = p_profile;
  perform set_config('app.verify_phone', 'off', true);
end $fn$;
revoke all on function public.verify_member_phone(uuid) from public, anon;
grant execute on function public.verify_member_phone(uuid) to authenticated;

create or replace function public.open_shoreside_thread()
returns uuid language plpgsql security definer set search_path to 'public'
as $fn$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  -- One live line per member: rejoining beats a drawer of parallel threads.
  select th.id into t
  from public.threads th
  join public.thread_members tm on tm.thread_id = th.id and tm.profile_id = me
  where th.kind = 'shoreside' and th.closed_at is null
  order by th.created_at desc limit 1;
  if t is not null then return t; end if;
  insert into public.threads (kind, title) values ('shoreside', 'Shoreside')
  returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, me);
  return t;
end $fn$;
revoke all on function public.open_shoreside_thread() from public, anon;
grant execute on function public.open_shoreside_thread() to authenticated;;
