-- The columns the quarter's features stand on. Each is inert until its
-- surface reads it.
alter table public.profiles add column if not exists comped_until date;
comment on column public.profiles.comped_until is 'Dues waived by the Bridge until this date. The plan stands; nothing is charged.';

alter table public.membership_plans add column if not exists guest_allowance integer not null default 0 check (guest_allowance between 0 and 6);
comment on column public.membership_plans.guest_allowance is 'Named guests a pass on this plan may carry. The FAQ and the guard both read it.';
update public.membership_plans set guest_allowance = 2 where active and price_cents > 0 and guest_allowance = 0;

alter table public.episodes
  add column if not exists by_request boolean not null default false,
  add column if not exists standby_passes integer not null default 0 check (standby_passes between 0 and 50),
  add column if not exists age_line text check (age_line is null or length(age_line) <= 40);
comment on column public.episodes.by_request is 'Places are requested and the Bridge decides the night before — the door reads "request a place", never a queue number.';
comment on column public.episodes.standby_passes is 'Standby passes sold beyond the hull ceiling that board only if a no-show frees a seat by muster.';
alter table public.passes add column if not exists standby boolean not null default false;

alter table public.venues add column if not exists access_note text check (access_note is null or length(access_note) <= 200);
comment on column public.venues.access_note is 'Step-free, lift, quiet room — what a member with an access need wants to know before booking.';

alter table public.automations add column if not exists delay_minutes integer not null default 0 check (delay_minutes between 0 and 43200);
create table if not exists public.automation_queue (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.automations(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete cascade,
  episode_id     uuid references public.episodes(id) on delete cascade,
  payload        jsonb not null default '{}'::jsonb,
  run_at         timestamptz not null,
  done_at        timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.automation_queue enable row level security;
create policy "the bridge reads the queue" on public.automation_queue for select to authenticated using (public.is_staff());
grant select on public.automation_queue to authenticated;
create index if not exists automation_queue_due on public.automation_queue (run_at) where done_at is null;

insert into public.email_templates (code, description, active)
values ('frames-wanted', 'After a night, to members who were aboard and in frame: send us what you shot, it lands in the approval queue.', true)
on conflict (code) do nothing;

alter table public.broadcasts
  add column if not exists send_at timestamptz,
  add column if not exists status text not null default 'sent' check (status in ('queued','sent'));;
