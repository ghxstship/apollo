-- open_direct_thread let a member write to anyone listed in the directory.
-- A dating-adjacent club with a vetted roster should still not be an open
-- inbox: you write to people you have sailed with, shared a table or an
-- anchor with — the ground shares_ground_with already computes — and to
-- Shoreside. The directory listing stays a way to be found, not a way to be
-- written to.
create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t uuid; ok boolean;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;
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

  ok := public.shares_ground_with(p_other)
        or public.is_staff()
        or exists (select 1 from public.profiles p where p.id = p_other and p.is_staff);

  if not ok then
    raise exception 'you write to people you have sailed with — book a night together first';
  end if;

  insert into public.threads (kind) values ('direct') returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, auth.uid()), (t, p_other);
  insert into public.direct_thread_pairs (lo, hi, thread_id)
  values (least(auth.uid(), p_other), greatest(auth.uid(), p_other), t);
  return t;
end
$function$;;
