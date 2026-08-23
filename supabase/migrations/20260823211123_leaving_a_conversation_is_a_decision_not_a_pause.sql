-- The last round set out to stop "a seat a moderator removed being restored by
-- the sender calling the RPC again". It did not. The existing-thread lookup
-- requires BOTH parties still seated, so removing one made the RPC miss the
-- thread entirely and mint a brand new one with both of them in it. Leaving
-- had the same effect: the door I added let a member out and the sender walked
-- them straight back in, leaving a trail of orphan threads.
--
-- A conversation between two people is one thing, however many times it is
-- opened. Find it by the pair, not by who happens to still be sitting in it —
-- and treat someone having left as the answer it is.
create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare t uuid; ok boolean; other_left boolean;
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

  -- The pair's thread, whoever is currently seated in it. Looking for a thread
  -- where BOTH are seated is what let a removal be undone.
  select th.id into t
  from public.threads th
  where th.kind = 'direct'
    and exists (select 1 from public.thread_members m
                where m.thread_id = th.id and m.profile_id = auth.uid())
     or (th.kind = 'direct' and exists (
           select 1 from public.thread_members m
           where m.thread_id = th.id and m.profile_id = p_other)
         and exists (select 1 from public.direct_thread_pairs dp
                     where dp.thread_id = th.id
                       and dp.lo = least(auth.uid(), p_other)
                       and dp.hi = greatest(auth.uid(), p_other)))
  limit 1;

  -- Resolve properly through the pair record rather than the seating.
  select dp.thread_id into t
  from public.direct_thread_pairs dp
  where dp.lo = least(auth.uid(), p_other)
    and dp.hi = greatest(auth.uid(), p_other)
  limit 1;

  if t is not null then
    -- Whoever is gone from it is gone by choice or by a moderator's hand.
    select not exists (
      select 1 from public.thread_members m
      where m.thread_id = t and m.profile_id = p_other
    ) into other_left;
    if other_left then
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
$$;;
