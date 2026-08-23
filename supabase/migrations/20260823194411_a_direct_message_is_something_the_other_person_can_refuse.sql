-- open_direct_thread validated the caller thoroughly and the recipient not at
-- all: any active member could open a DM with any other member — no shared
-- sailing, no directory opt-in, no consent — and because the function is a
-- definer it seated BOTH parties, walking straight past the is_staff() INSERT
-- policy that guards thread_members from outside.
--
-- The recipient then had no way out. thread_members had five policies and no
-- self-DELETE, so leaving returned 200 [] — the silent no-op that reads to a
-- UI as "done". And a seat a moderator removed was restored by the sender
-- simply calling the RPC again, which made moderation on this surface
-- unenforceable.
--
-- Three things: somewhere to record a refusal, an entitlement test on the way
-- in, and a door out.

create table if not exists public.member_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint a_block_needs_two_people check (blocker_id <> blocked_id)
);

alter table public.member_blocks enable row level security;
revoke all on public.member_blocks from anon, authenticated;
grant select, insert, delete on public.member_blocks to authenticated;

create policy "see your own blocks" on public.member_blocks
  for select to authenticated using (blocker_id = auth.uid() or public.is_staff());
create policy "block someone" on public.member_blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "unblock someone" on public.member_blocks
  for delete to authenticated using (blocker_id = auth.uid());

comment on table public.member_blocks is
  'One member declining contact from another. Consulted by open_direct_thread, so a block survives the sender reopening the conversation.';

-- Leaving is a member's own act, and it has to be loud enough for a UI to know
-- it happened.
drop policy if exists "leave a thread you are in" on public.thread_members;
create policy "leave a thread you are in" on public.thread_members
  for delete to authenticated
  using (profile_id = auth.uid());

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

  -- A refusal outlives the conversation it ended.
  if exists (
    select 1 from public.member_blocks b
    where (b.blocker_id = p_other and b.blocked_id = auth.uid())
       or (b.blocker_id = auth.uid() and b.blocked_id = p_other)
  ) then
    raise exception 'that member is not taking messages from you';
  end if;

  -- Entitlement, not merely being signed in. You may write to someone you have
  -- sailed with, or to someone who has chosen to be listed. Staff may write to
  -- anyone, because Shoreside has to be able to reach a member.
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

  select tm.thread_id into t
  from public.thread_members tm
  join public.threads th on th.id = tm.thread_id and th.kind = 'direct'
  where tm.profile_id = auth.uid()
    and exists (select 1 from public.thread_members o
                where o.thread_id = tm.thread_id and o.profile_id = p_other)
  limit 1;
  if t is not null then return t; end if;

  insert into public.threads (kind) values ('direct') returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, auth.uid()), (t, p_other);
  return t;
end
$$;

revoke execute on function public.open_direct_thread(uuid) from public, anon;
grant execute on function public.open_direct_thread(uuid) to authenticated;;
