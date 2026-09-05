-- Five findings from the social-layer tests.
--
-- A paused member already seated in a thread could still write: the INSERT
-- policy asked only whether the thread was closed. Spending, posting and
-- writing are all gated on standing; this one was not.
drop policy if exists "write to own threads" on public.messages;
create policy "write to own threads" on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.in_thread(thread_id)
    and (public.is_staff() or public.is_active())
    and (public.is_staff() or not exists (
      select 1 from public.threads t where t.id = messages.thread_id and t.closed_at is not null))
  );

-- A direct thread is two seats. When one has left, a word from a stale tab
-- landed in an empty room; and a member who had declined another could still
-- be written to inside the existing thread, because the block was consulted
-- only when the thread was opened. The application can see only the writer's
-- own blocks, so the rule lives here where both sides are readable.
create or replace function public.a_direct_thread_needs_both_seats()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_kind text; v_other uuid; v_seats integer;
begin
  if public.is_staff() then return new; end if;
  select t.kind into v_kind from public.threads t where t.id = new.thread_id;
  if v_kind is distinct from 'direct' then return new; end if;
  select count(*) into v_seats from public.thread_members m where m.thread_id = new.thread_id;
  if v_seats < 2 then raise exception 'that member has left this conversation'; end if;
  select m.profile_id into v_other from public.thread_members m where m.thread_id = new.thread_id and m.profile_id <> new.author_id limit 1;
  if v_other is not null and exists (
    select 1 from public.member_blocks b
     where (b.blocker_id = v_other and b.blocked_id = new.author_id)
        or (b.blocker_id = new.author_id and b.blocked_id = v_other)) then
    raise exception 'that member is not taking messages from you';
  end if;
  return new;
end $function$;
revoke all on function public.a_direct_thread_needs_both_seats() from public, anon, authenticated;
drop trigger if exists a_direct_thread_needs_both_seats on public.messages;
create trigger a_direct_thread_needs_both_seats
  before insert on public.messages
  for each row execute function public.a_direct_thread_needs_both_seats();

-- A handle is a URL segment. The check was length-only and accepted
-- "e2e bad/x", a page /directory/[handle] can never reach. Every live handle
-- already fits the shape.
alter table public.profiles drop constraint if exists profiles_handle_is_sane;
alter table public.profiles add constraint profiles_handle_is_sane
  check (handle is null or handle ~ '^[a-z0-9._-]{2,32}$');

-- The Log had a public read and no writer: nobody could file a dispatch from
-- the product. Staff keep it.
create policy "staff write the log" on public.log_posts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant insert, update, delete on public.log_posts to authenticated;

-- A raced fixture redemption could not be struck. Staff may.
create policy "staff strike a redemption" on public.reward_redemptions
  for delete to authenticated using (public.is_staff());
grant delete on public.reward_redemptions to authenticated;;
