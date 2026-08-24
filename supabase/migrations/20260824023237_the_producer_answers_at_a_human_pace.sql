-- /api/producer had no rate limit at all: thirty concurrent authenticated POSTs
-- all returned 200 in 614ms. With a key configured that is up to six model
-- turns of a thousand tokens per request, per member, unbounded — a bill rather
-- than a conversation, and nothing in src/ throttled it.
--
-- The bucket lives here rather than in the route because the route runs on a
-- serverless edge where in-memory counters do not survive between invocations,
-- and because the database is the only thing both instances share.
create table if not exists public.producer_turns (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asked_at   timestamptz not null default now()
);

create index if not exists producer_turns_recent
  on public.producer_turns (profile_id, asked_at desc);

alter table public.producer_turns enable row level security;
revoke all on public.producer_turns from anon, authenticated;

comment on table public.producer_turns is
  'One row per question put to the Producer. Written only by take_a_producer_turn; nobody reads it but the Bridge.';

drop policy if exists "staff read producer turns" on public.producer_turns;
create policy "staff read producer turns" on public.producer_turns
  for select to authenticated using (public.is_staff());
grant select on public.producer_turns to authenticated;

-- Returns how many turns are left. The route calls it before spending anything.
create or replace function public.take_a_producer_turn()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid(); recent int; cap int := 20;
begin
  if me is null then raise exception 'sign in first'; end if;

  delete from public.producer_turns where asked_at < now() - interval '1 day';

  select count(*) into recent
  from public.producer_turns
  where profile_id = me and asked_at > now() - interval '10 minutes';

  if recent >= cap then
    raise exception 'the Producer needs a moment — try again in a few minutes';
  end if;

  insert into public.producer_turns (profile_id) values (me);
  return cap - recent - 1;
end;
$$;

revoke execute on function public.take_a_producer_turn() from public, anon;
grant execute on function public.take_a_producer_turn() to authenticated;;
