-- Cancelling a sailing credits the money and leaves everything else standing:
-- the rsvps stay 'aboard', so the member keeps the 25 Knots for a sailing that
-- never happened, the pass still counts against their monthly allowance — a
-- member whose one pass that month went to a sailing the club called off could
-- book nothing else — and it still reads as a pass held on their profile.
--
-- Nothing about a cancelled sailing should cost the member anything.
create or replace function public.close_out_a_cancelled_sailing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- Knots for a sailing that will not happen go back. The money is credited
    -- by handle_voyage_status; this is the rest of it.
    insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
    select f.profile_id, -sum(f.delta), 'Sailing cancelled', new.id
    from public.fathoms_ledger f
    where f.voyage_id = new.id
      and f.reason in ('Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled')
    group by f.profile_id
    having sum(f.delta) > 0;

    -- Seats and crew go too.
    delete from public.table_seats ts
    using public.dating_tables dt
    where dt.id = ts.table_id and dt.voyage_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.close_out_a_cancelled_sailing() from public, anon, authenticated;

drop trigger if exists close_out_a_cancelled_sailing on public.voyages;
create trigger close_out_a_cancelled_sailing
  after update of status on public.voyages
  for each row execute function public.close_out_a_cancelled_sailing();

-- The monthly allowance counts passes aboard. A pass on a sailing the club
-- cancelled is not one the member spent.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rsvp_guard' limit 1;

  newsrc := replace(src,
    E'    where r.profile_id = new.profile_id and r.status = ''aboard'' and r.id <> new.id\n      and date_trunc(''month'', vv.starts_at) = date_trunc(''month'', v.starts_at);',
    E'    where r.profile_id = new.profile_id and r.status = ''aboard'' and r.id <> new.id\n      and vv.status <> ''cancelled''\n      and date_trunc(''month'', vv.starts_at) = date_trunc(''month'', v.starts_at);');

  if newsrc = src then
    raise exception 'could not find the monthly allowance count in rsvp_guard';
  end if;
  execute newsrc;
end $outer$;

-- A released pass should go to someone on the waitlist, and the waitlister was
-- exactly who could not take it: the "already hold a pass" test counted ANY
-- rsvp row on the sailing, waitlist and not_going included.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_pass_transfer' limit 1;

  newsrc := replace(src,
    E'    where r.voyage_id = v.id and r.profile_id = t.to_profile and r.id <> t.rsvp_id',
    E'    where r.voyage_id = v.id and r.profile_id = t.to_profile and r.id <> t.rsvp_id\n      and r.status = ''aboard''');

  if newsrc = src then
    raise exception 'could not find the duplicate-pass test in accept_pass_transfer';
  end if;
  execute newsrc;
end $outer$;

-- Consistency: shares_ground_with counts a pass hand-off as shared ground, so a
-- member could be named as your hand-off partner and yet be unwritable-to.
create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare t uuid; ok boolean;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if p_other = auth.uid() then raise exception 'that is you'; end if;

  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'no such member';
  end if;

  if exists (
    select 1 from public.member_blocks b
    where (b.blocker_id = p_other and b.blocked_id = auth.uid())
       or (b.blocker_id = auth.uid() and b.blocked_id = p_other)
  ) then
    raise exception 'that member is not taking messages from you';
  end if;

  select dp.thread_id into t
  from public.direct_thread_pairs dp
  where dp.lo = least(auth.uid(), p_other)
    and dp.hi = greatest(auth.uid(), p_other);

  if t is not null then
    if not exists (select 1 from public.thread_members m
                   where m.thread_id = t and m.profile_id = p_other) then
      raise exception 'that member has left this conversation';
    end if;
    if not exists (select 1 from public.thread_members m
                   where m.thread_id = t and m.profile_id = auth.uid()) then
      raise exception 'you left this conversation';
    end if;
    return t;
  end if;

  -- The same ground the directory uses to decide whether it may name them.
  ok := public.shares_ground_with(p_other)
        or exists (select 1 from public.profiles p
                   where p.id = p_other and p.in_directory and p.status = 'active');

  if not ok then
    raise exception 'you have not sailed with that member, and they are not listed';
  end if;

  insert into public.threads (kind) values ('direct') returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, auth.uid()), (t, p_other);
  insert into public.direct_thread_pairs (lo, hi, thread_id)
  values (least(auth.uid(), p_other), greatest(auth.uid(), p_other), t);
  return t;
end
$$;

revoke execute on function public.open_direct_thread(uuid) from public, anon;
grant execute on function public.open_direct_thread(uuid) to authenticated;

-- Seal these two the way everything else is sealed: by policy, returning an
-- empty result, not by a missing grant that answers 42501.
grant select on public.member_directory, public.agreement_standing to anon;

-- voyage_capacity handed anon the whole set of privileges rather than SELECT.
revoke all on public.voyage_capacity from anon;
grant select on public.voyage_capacity to anon, authenticated;;
