/* PAUSED · AT SEA — "up to three months a year, no charge, number kept."

   Today set_own_standing() will pause a membership as often and for as long as
   a member asks, forever. The dues code stops charging; nothing stops pausing.
   That is a free membership available by pressing one button, and the only
   thing between the club and it is that nobody has noticed.

   The budget is enforced on the member's OWN pause and not on the club's. A
   pause the Bridge places is discipline or a billing failure, not a sabbatical,
   and counting it against the member's three months would punish someone for
   something done to them. The two are told apart by app.set_standing, which
   set_own_standing() sets and nothing else does — the same signal
   guard_privileged_profile_columns already trusts to tell a member's own
   standing change from a forged one. */
create table public.membership_pauses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  by_the_member boolean not null,
  constraint a_pause_ends_after_it_starts check (ended_at is null or ended_at >= started_at)
);

/* One running pause per member. Without this a status write that fires twice
   opens two windows and the budget counts the same days twice — against the
   member. */
create unique index one_running_pause_per_member
  on public.membership_pauses (profile_id) where ended_at is null;

alter table public.membership_pauses enable row level security;

create policy "your own pauses or staff" on public.membership_pauses
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

/* Written only by the trigger below. A member who could INSERT here could
   forge a closed window and reset their own budget. */
revoke insert, update, delete on public.membership_pauses from anon, authenticated;

/* Days of member-initiated pause inside the trailing year. A running pause
   counts up to now, because a member three months into an open pause has spent
   three months whether or not they have ended it. */
create or replace function public.membership_pause_days_used(p_profile uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(
    extract(epoch from (
      least(coalesce(mp.ended_at, now()), now())
      - greatest(mp.started_at, now() - interval '365 days')
    )) / 86400
  ), 0)::integer
  from public.membership_pauses mp
  where mp.profile_id = p_profile
    and mp.by_the_member
    and coalesce(mp.ended_at, now()) > now() - interval '365 days';
$$;

create or replace function public.guard_the_pause_budget()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mine boolean;
  v_used integer;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'paused' then return new; end if;

  v_mine := coalesce(current_setting('app.set_standing', true), 'off') = 'on';
  if not v_mine then return new; end if;

  v_used := public.membership_pause_days_used(new.id);
  if v_used >= 90 then
    raise exception 'three months at sea is the year''s allowance, and % days are spent — Shoreside can talk about the rest', v_used;
  end if;
  return new;
end;
$$;

create trigger guard_the_pause_budget
  before update on public.profiles
  for each row execute function public.guard_the_pause_budget();

/* The record of the window itself. AFTER, so it only writes windows that were
   actually allowed to happen. */
create or replace function public.record_the_pause_window()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'paused' then
    insert into public.membership_pauses (profile_id, by_the_member)
    values (new.id, coalesce(current_setting('app.set_standing', true), 'off') = 'on')
    on conflict do nothing;
  elsif old.status = 'paused' then
    update public.membership_pauses
       set ended_at = now()
     where profile_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger record_the_pause_window
  after update on public.profiles
  for each row execute function public.record_the_pause_window();

revoke all on function public.guard_the_pause_budget() from public, anon, authenticated;
revoke all on function public.record_the_pause_window() from public, anon, authenticated;
revoke all on function public.membership_pause_days_used(uuid) from public;
grant execute on function public.membership_pause_days_used(uuid) to authenticated;
;
