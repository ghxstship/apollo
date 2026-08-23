-- is_active() went into the RLS policies, but SECURITY DEFINER functions write
-- without ever consulting a policy — so a held membership could still take and
-- confirm a chair at a blind table and open a new conversation with another
-- member. The hold has to be stated in each of them.
create or replace function public.claim_table_seat(p_table uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  cap integer;
  taken integer;
  until_ts timestamptz;
begin
  if me is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  perform pg_advisory_xact_lock(hashtext('table_seat:' || me::text));

  select seats into cap from public.dating_tables where id = p_table;
  if cap is null then raise exception 'no such table'; end if;

  delete from public.table_seats
  where table_id = p_table and state = 'held' and held_until < now();

  select count(*) into taken from public.table_seats
  where table_id = p_table and (state = 'confirmed' or held_until >= now());
  if taken >= cap then
    raise exception 'that table is full — % seats, all taken', cap;
  end if;

  delete from public.table_seats ts
  using public.dating_tables t, public.dating_tables mine
  where ts.profile_id = me and ts.table_id = t.id and mine.id = p_table
    and t.voyage_id = mine.voyage_id and ts.table_id <> p_table;

  insert into public.table_seats (table_id, profile_id)
  values (p_table, me)
  on conflict (table_id, profile_id)
  do update set held_until = now() + interval '15 minutes'
  where public.table_seats.state = 'held'
  returning held_until into until_ts;

  return until_ts;
end;
$function$;

create or replace function public.confirm_table_seat(p_table uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  update public.table_seats
  set state = 'confirmed'
  where table_id = p_table and profile_id = me
    and (state = 'confirmed' or held_until >= now());
  if not found then
    raise exception 'the hold lapsed — claim the seat again';
  end if;
end;
$function$;

create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if p_other = auth.uid() then raise exception 'that is you'; end if;
  select tm.thread_id into t
  from public.thread_members tm
  join public.threads th on th.id = tm.thread_id and th.kind = 'direct'
  where tm.profile_id = auth.uid()
    and exists (select 1 from public.thread_members o where o.thread_id = tm.thread_id and o.profile_id = p_other)
  limit 1;
  if t is not null then return t; end if;
  insert into public.threads (kind) values ('direct') returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, auth.uid()), (t, p_other);
  return t;
end $function$;
