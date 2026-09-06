-- Two small corrections to the wallet registrations, one to the number and one
-- to what happens after.
--
-- The number. The cap landed at eight on 2026-09-06, reasoned from a real
-- member's real devices — phone, watch, iPad, a second phone mid-upgrade, and
-- headroom. Six is the owner's ruling and it covers the same list; the two
-- spare slots were never the thing standing between a member and a shared
-- pass, because nothing here is what stops a pass being shared. The boarding
-- code is the credential and the gangway is the control: a second person
-- holding the same code is refused at the dock, by a person, whether the pass
-- came off one phone or six. This cap is hygiene — it bounds the push fan-out
-- that fires on every subscription event, and it keeps one member's row count
-- from being a number nobody chose.
--
-- What happens after. A registration was written once and never again. A phone
-- that is traded in, wiped, or that simply removes the pass without sending
-- the DELETE leaves its row behind for ever, and every one of those rows is an
-- APNs push on every wallet touch, aimed at a token that will never answer. So
-- the row records when the device was last heard from, and the nightly
-- retention sweep — the one that already takes the read notices, the spent
-- outbox and the departed profiles — lets go of anything that has not asked
-- for six months.

-- ── 1 ── When the device was last heard from ────────────────────────────────
-- Added nullable and backfilled from created_at, rather than defaulted to now:
-- a phone that registered in March and has been silent since is silent since
-- March, and stamping every existing row with today would hide exactly the
-- rows the sweep exists to find.
alter table public.wallet_registrations
  add column if not exists last_seen_at timestamptz;

update public.wallet_registrations
   set last_seen_at = created_at
 where last_seen_at is null;

alter table public.wallet_registrations
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null;

comment on column public.wallet_registrations.last_seen_at is
  'The last time this device spoke to the PassKit web service — registering, refreshing its push token, or asking which passes changed. The retention sweep reads it.';

create index if not exists wallet_registrations_last_seen
  on public.wallet_registrations (last_seen_at);

insert into public.club_settings (key, value_int, note)
values ('wallet_registration_stale_days', 180,
        'A wallet registration unheard from for this long is swept. Hygiene, not an anti-sharing control — the boarding code is the credential and the gangway is the control.')
on conflict (key) do nothing;

-- ── 2 ── Six ───────────────────────────────────────────────────────────────
create or replace function public.cap_wallet_registrations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare held int; cap int := 6;
begin
  perform pg_advisory_xact_lock(hashtext('wallet-reg:' || new.pass_type || ':' || new.serial::text));

  select count(*) into held
  from public.wallet_registrations r
  where r.pass_type = new.pass_type and r.serial = new.serial;

  if held >= cap then
    raise exception 'that pass is on as many devices as the club keeps track of'
      using errcode = '53400';
  end if;
  return new;
end $fn$;

revoke all on function public.cap_wallet_registrations() from public, anon, authenticated;

drop trigger if exists a_pass_is_on_a_bounded_number_of_devices on public.wallet_registrations;
create trigger a_pass_is_on_a_bounded_number_of_devices
  before insert on public.wallet_registrations
  for each row execute function public.cap_wallet_registrations();

-- ── 3 ── The sweep, in the sweep that already runs ──────────────────────────
-- Patched into cron_purge_expired_records rather than restated, on the idiom
-- this corpus has used since August: three other changes are landing on this
-- same function this week, and a create-or-replace from a stale copy silently
-- deletes whichever of them replayed first. The anchor is the last line of the
-- body and the patch goes in front of it; a missing anchor raises rather than
-- quietly doing nothing.
do $$
declare src text; a1 text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'cron_purge_expired_records' and p.pronamespace = 'public'::regnamespace;
  a1 := E'  perform public.erase_departed_profiles();';
  if position(a1 in src) = 0 then
    raise exception 'cron_purge_expired_records: anchor missing — re-read before patching';
  end if;
  if position('wallet_registrations' in src) > 0 then
    raise notice 'cron_purge_expired_records already sweeps the wallet registrations';
  else
    src := replace(src, a1,
      E'  /* A phone that has not spoken to the PassKit service in six months.\n' ||
      E'     Hygiene: it bounds the push fan-out and keeps the row count honest.\n' ||
      E'     It is NOT an anti-sharing control — the boarding code is the\n' ||
      E'     credential and the gangway is what stops a second person using it.\n' ||
      E'     A device that comes back simply registers again. */\n' ||
      E'  delete from public.wallet_registrations\n' ||
      E'   where last_seen_at < now() - make_interval(days => coalesce(public.club_setting(''wallet_registration_stale_days''), 180));\n' ||
      a1);
    execute src;
  end if;
end $$;

notify pgrst, 'reload schema';
