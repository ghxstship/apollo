-- The franchise mechanic, kept off the cast: a bounded question — the next
-- Special's city, the regatta's route — with options, a closing time, and one
-- vote per active member. Settled by the Bridge like a contest. Never a
-- ranking of people.
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (length(question) between 3 and 200),
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  closes_at   timestamptz not null,
  settled     integer,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.polls enable row level security;
create policy "members read the polls" on public.polls for select to authenticated using (true);
create policy "staff keep the polls" on public.polls for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select on public.polls to authenticated;
grant insert, update, delete on public.polls to authenticated;

create table if not exists public.poll_votes (
  poll_id     uuid not null references public.polls(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  option      integer not null check (option >= 0),
  created_at  timestamptz not null default now(),
  primary key (poll_id, profile_id)
);
alter table public.poll_votes enable row level security;
create policy "a member sees their own vote" on public.poll_votes for select to authenticated using (profile_id = auth.uid() or public.is_staff());
grant select on public.poll_votes to authenticated;

create or replace function public.cast_vote(p_poll uuid, p_option integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer; closes timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;
  select jsonb_array_length(options), closes_at into n, closes from public.polls where id = p_poll;
  if n is null then raise exception 'no such question'; end if;
  if closes <= now() then raise exception 'that question has closed'; end if;
  if p_option < 0 or p_option >= n then raise exception 'pick one of the options'; end if;
  insert into public.poll_votes (poll_id, profile_id, option) values (p_poll, auth.uid(), p_option)
  on conflict (poll_id, profile_id) do update set option = excluded.option, created_at = now();
end $function$;
revoke all on function public.cast_vote(uuid, integer) from public, anon;
grant execute on function public.cast_vote(uuid, integer) to authenticated;

create or replace view public.poll_tallies
with (security_invoker = on) as
select v.poll_id, v.option, count(*) as votes
  from public.poll_votes v group by 1, 2;
grant select on public.poll_tallies to authenticated;

create or replace function public.poll_results(p_poll uuid)
returns table (option integer, votes bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.option, count(*) from public.poll_votes v
   where v.poll_id = p_poll
     and (auth.uid() is not null)
     and exists (select 1 from public.polls p where p.id = p_poll and (p.closes_at <= now() or public.is_staff()))
   group by 1 order by 1;
$function$;
revoke all on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated;;
