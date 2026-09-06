-- Quiet hours did not exist, and both outboxes drain every five minutes.
--
-- Zero occurrences of the idea anywhere in the repository. A push about a berth
-- that opened, or a text about a night three weeks away, fires the moment it is
-- written -- and it is written whenever a scheduled job happens to run, which
-- for the pass sweeps is the small hours.
--
-- For SMS this is not merely rude. 47 CFR §64.1200(c)(1) puts telemarketing
-- calls and texts inside 8am–9pm in the RECIPIENT'S local time, and the club
-- has members in three cities and will have them in more.
--
-- DEFERRED, NOT DROPPED, which is the whole design. A message held until
-- morning still arrives; a message dropped is a member who never heard. Both
-- outboxes already carry next_attempt_at and both drains already order by it,
-- so quiet hours need no change to either drain: a trigger on insert pushes
-- the row's first attempt to the end of the window, and the existing machinery
-- does the rest.
--
-- URGENCY OVERRIDES IT. A weather hold called at midnight for a sailing at noon
-- is exactly the message a member wants at midnight, and a quiet-hours rule
-- that swallowed it would be a rule that made the product worse. The urgent
-- templates are named, and they are named as a SHORT list on purpose -- the
-- default is quiet, and anything wanting to be an exception has to say so.

alter table public.profiles
  add column if not exists quiet_from time,
  add column if not exists quiet_to   time;

comment on column public.profiles.quiet_from is
  'When this member stops wanting to be woken, in their own timezone. NULL means the club''s default window applies. Held as a clock time rather than an instant because that is what a person means by "after ten".';
comment on column public.profiles.quiet_to is
  'When they are willing to hear from the club again. A window may cross midnight -- 22:00 to 08:00 is the ordinary case, and the arithmetic below handles it.';

insert into public.club_settings (key, value_int, note) values
  ('quiet_from_hour', 21, 'The hour, in each member''s own timezone, after which the club stops sending anything that is not urgent. Nine in the evening: the TCPA''s own boundary for texts, applied to every channel because a push at ten at night is no more welcome than a text.'),
  ('quiet_to_hour',    8, 'The hour after which the club may send again. Eight in the morning, the other end of the TCPA window.')
on conflict (key) do nothing;

-- ── Is it quiet where this member is? ───────────────────────────────────────

create or replace function public.quiet_until(p_profile uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_zone text;
  v_from time;
  v_to   time;
  v_local timestamp;
  v_day date;
begin
  select coalesce(p.time_zone, public.club_zone()),
         coalesce(p.quiet_from, make_time(greatest(0, least(23, coalesce(public.club_setting('quiet_from_hour'), 21))), 0, 0)),
         coalesce(p.quiet_to,   make_time(greatest(0, least(23, coalesce(public.club_setting('quiet_to_hour'), 8))), 0, 0))
    into v_zone, v_from, v_to
    from public.profiles p where p.id = p_profile;

  if v_zone is null then return null; end if;
  /* A window with the same start and end is not a window. Somebody who has set
     both to the same hour has said "never quiet", and reading it as "always
     quiet" would stop every message they ever get. */
  if v_from = v_to then return null; end if;

  v_local := now() at time zone v_zone;
  v_day := v_local::date;

  if v_from < v_to then
    /* An ordinary daytime window, e.g. 01:00–06:00. */
    if v_local::time >= v_from and v_local::time < v_to then
      return (v_day + v_to) at time zone v_zone;
    end if;
    return null;
  end if;

  /* The window crosses midnight, which is the usual case: 21:00–08:00. */
  if v_local::time >= v_from then
    return ((v_day + 1) + v_to) at time zone v_zone;
  end if;
  if v_local::time < v_to then
    return (v_day + v_to) at time zone v_zone;
  end if;
  return null;
end $fn$;

revoke all on function public.quiet_until(uuid) from public, anon;
grant execute on function public.quiet_until(uuid) to authenticated, service_role;

comment on function public.quiet_until(uuid) is
  'When this member''s quiet hours end, or NULL if it is not quiet where they are right now. Read in the member''s own timezone, falling back to the club''s. A window whose ends are equal means "never quiet" -- reading that as "always quiet" would silence somebody permanently by accident.';

-- ── Templates that may wake somebody ────────────────────────────────────────

create table if not exists public.urgent_templates (
  template text primary key,
  why      text not null
);

comment on table public.urgent_templates is
  'The messages allowed through quiet hours. A short list on purpose: the default is quiet, and anything that wants to be an exception has to be added here with a reason somebody wrote down. Everything else waits until morning and still arrives.';

alter table public.urgent_templates enable row level security;
drop policy if exists "anyone signed in reads what counts as urgent" on public.urgent_templates;
create policy "anyone signed in reads what counts as urgent" on public.urgent_templates
  for select to authenticated using (true);
grant select on public.urgent_templates to authenticated;

insert into public.urgent_templates (template, why) values
  ('weather-hold',    'A sailing is held or moved. A member reading it at seven in the morning instead of midnight may already be on their way to the dock.'),
  ('voyage-cancelled','The night is off. Same reasoning as a hold, more so.'),
  ('gangway-details', 'How to get aboard, sent close to the hour. Useless the next morning.'),
  ('boarding-pass',   'The pass itself. Sent when a member asks for it, and they are looking at the screen.'),
  ('new-sign-in',     'Somebody signed in as them from a device the club has not seen. If it was not them, six hours of silence is six hours too many.'),
  ('password-changed','Their password changed. Same reasoning.'),
  ('two-step-off',    'Their second factor was removed. Same reasoning, and this is the one an attacker wants.')
on conflict (template) do nothing;

-- ── Holding a message until morning ─────────────────────────────────────────

create or replace function public.hold_until_morning()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_profile uuid;
  v_until   timestamptz;
begin
  /* Only a first attempt. A retry is already late and re-deferring it would
     push a failing message further from the eyes that could fix it. */
  if coalesce(new.attempts, 0) > 0 then return new; end if;

  if tg_table_name = 'push_outbox' then
    if new.urgent then return new; end if;
    v_profile := new.profile_id;
  else
    /* The SMS outbox holds a number, not a member. Matched back to the profile
       so the window is read in the recipient's own timezone rather than the
       club's -- which is the entire point of a quiet hour. */
    select p.id into v_profile from public.profiles p
     where p.phone is not null and p.phone = new.to_phone limit 1;
    if exists (select 1 from public.urgent_templates u where u.template = new.template) then
      return new;
    end if;
  end if;

  if v_profile is null then return new; end if;

  v_until := public.quiet_until(v_profile);
  if v_until is null then return new; end if;

  new.next_attempt_at := greatest(coalesce(new.next_attempt_at, now()), v_until);
  return new;
end $fn$;

revoke all on function public.hold_until_morning() from public, anon, authenticated;

comment on function public.hold_until_morning() is
  'Pushes a message''s first attempt to the end of the recipient''s quiet hours. Deferred, never dropped: both drains already order by next_attempt_at, so this needs no change to either of them. Retries are left alone — a retry is already late, and deferring it again moves a failing message further from the eyes that could fix it.';

-- A push has no template to look up, so it carries its own urgency.
--
-- sms_outbox names a template and the list above answers for it. push_outbox
-- carries a title, a body and a url and nothing that says what kind of thing
-- it is -- so without this column every push would wait until morning,
-- including the one telling somebody their sailing is off.

alter table public.push_outbox
  add column if not exists urgent boolean not null default false;

comment on column public.push_outbox.urgent is
  'Whether this push may be delivered inside the recipient''s quiet hours. False by default: the exception has to be asked for. Set by fan_out_notification for weather notices, which are the ones a member wants at midnight rather than at eight.';

-- Anchored surgery rather than a rewrite: two people have edited this function
-- today and replacing it wholesale is how one of them loses their change.
do $$
declare
  src text := pg_get_functiondef('public.fan_out_notification()'::regprocedure);
  anchor text := $a$insert into public.push_outbox (profile_id, title, body, url)
    values (new.profile_id, new.title, new.body, coalesce(new.href, '/inbox'));$a$;
  replaced text := $a$insert into public.push_outbox (profile_id, title, body, url, urgent)
    values (new.profile_id, new.title, new.body, coalesce(new.href, '/inbox'),
            new.kind = 'weather');$a$;
begin
  if position('urgent' in src) > 0 then
    return; /* already carries it */
  end if;
  if position(anchor in src) = 0 then
    raise exception 'the push insert in fan_out_notification() is not where this migration expected it — read it before editing';
  end if;
  execute replace(src, anchor, replaced);
end $$;

drop trigger if exists sms_waits_for_morning on public.sms_outbox;
create trigger sms_waits_for_morning
before insert on public.sms_outbox
for each row execute function public.hold_until_morning();

drop trigger if exists push_waits_for_morning on public.push_outbox;
create trigger push_waits_for_morning
before insert on public.push_outbox
for each row execute function public.hold_until_morning();

notify pgrst, 'reload schema';
