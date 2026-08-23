-- The previous migration wrote open_direct_thread against a table that did not
-- exist. plpgsql resolves names at run time, so it was created happily and
-- would have failed on the first call. Creating it now, backfilling the
-- existing direct threads, and rewriting the function without the dead first
-- lookup that the second one immediately overwrote.
create table if not exists public.direct_thread_pairs (
  lo         uuid not null references public.profiles(id) on delete cascade,
  hi         uuid not null references public.profiles(id) on delete cascade,
  thread_id  uuid not null references public.threads(id) on delete cascade,
  primary key (lo, hi),
  constraint the_pair_is_ordered check (lo < hi)
);

create unique index if not exists direct_thread_pairs_thread on public.direct_thread_pairs (thread_id);

alter table public.direct_thread_pairs enable row level security;
revoke all on public.direct_thread_pairs from anon, authenticated;

create policy "see your own pairs" on public.direct_thread_pairs
  for select to authenticated
  using (lo = auth.uid() or hi = auth.uid() or public.is_staff());
grant select on public.direct_thread_pairs to authenticated;

comment on table public.direct_thread_pairs is
  'One direct thread per pair of members, recorded by the pair rather than by who is currently seated — so a member who leaves, or who a moderator removes, is not simply re-seated when the other reopens it.';

-- Existing direct threads, keyed by the two people who were in them.
insert into public.direct_thread_pairs (lo, hi, thread_id)
select least(a.profile_id, b.profile_id), greatest(a.profile_id, b.profile_id), a.thread_id
from public.thread_members a
join public.thread_members b on b.thread_id = a.thread_id and b.profile_id > a.profile_id
join public.threads t on t.id = a.thread_id
where t.kind = 'direct'
on conflict do nothing;

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

  -- The pair's thread, whoever is currently seated in it.
  select dp.thread_id into t
  from public.direct_thread_pairs dp
  where dp.lo = least(auth.uid(), p_other)
    and dp.hi = greatest(auth.uid(), p_other);

  if t is not null then
    -- An empty chair in an existing conversation is an answer, not an
    -- invitation to start a fresh one.
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

  select public.is_staff()
      or exists (
           select 1
           from public.rsvps mine
           join public.rsvps theirs on theirs.voyage_id = mine.voyage_id
           where mine.profile_id = auth.uid()
             and theirs.profile_id = p_other
             and mine.status = 'aboard' and theirs.status = 'aboard'
         )
      or exists (
           select 1 from public.profiles p
           where p.id = p_other and p.in_directory and p.status = 'active'
         )
    into ok;

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
grant execute on function public.open_direct_thread(uuid) to authenticated;;
