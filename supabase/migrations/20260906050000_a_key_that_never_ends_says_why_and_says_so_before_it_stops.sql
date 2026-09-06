-- A key can already be given an end, and verifyKey already refuses one past
-- its date. What the club never had was the human half of it.
--
-- The column landed on 2026-09-06 with no default, deliberately: a fuse in
-- every key minted from then on, with no screen showing the date and no way to
-- choose one, is an integration going dark on a Tuesday morning. So the choice
-- was left to the Bridge and the owner, and until now the Bridge could not
-- make it — the keys console showed a label, a scope, a last-used stamp and a
-- Revoke button, and nothing at all about how old a key was or whether it ever
-- stopped.
--
-- Three things are missing and all three are here.
--
-- 1. A key with no end is allowed, because a partner integration that must not
--    break is a real thing to want. It is no longer allowed to be an accident:
--    a key minted with no date has to carry a sentence saying why, and the
--    sentence is kept on the row where the next operator reads it.
-- 2. Existing keys are NOT backdated and NOT given a date. Every one of them
--    was cut under the old rule and something may be holding it. The console
--    flags the old ones instead, which is the visible half of the same fact
--    and breaks nothing overnight.
-- 3. A key that is about to stop says so, twice — at fourteen days and again
--    at three — in the club's own Word, to the operator who cut it. The card
--    that is about to expire has had exactly this for two days
--    (run_dunning, card_notices); this is the same ladder aimed at the Bridge
--    rather than at a member, keyed on the key's own end date so that moving
--    the date re-arms both rungs.

-- ── 1 ── Why a key has no end ────────────────────────────────────────────────

alter table public.api_keys
  add column if not exists no_expiry_reason text;

comment on column public.api_keys.no_expiry_reason is
  'Why this key was cut with no end. Required on any key minted or set to a null expires_at from 2026-09-06; null on the keys that predate the rule, which are flagged in the console rather than changed.';

-- The rule fires on INSERT, and on an UPDATE that touches expires_at. It does
-- not fire when an operator revokes a key or when verifyKey stamps
-- last_used_at, so the keys that already exist go on behaving exactly as they
-- do today and nothing that runs on a schedule trips over them.
create or replace function public.a_key_with_no_end_says_why()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.expires_at is null then
    if coalesce(btrim(new.no_expiry_reason), '') = '' then
      -- Raised with the default P0001 on purpose: voice() in src/lib/errors.ts
      -- passes a plain raise through as a sentence and flattens 23514 to
      -- "check the numbers", which is not what is wrong here.
      raise exception 'a key with no end has to say why — name what holds it and who to ask before it is cut off';
    end if;
    new.no_expiry_reason := btrim(new.no_expiry_reason);
  else
    -- A key with a date has nothing to explain. Clearing it keeps the two
    -- columns from disagreeing after an operator sets a date on a key that
    -- used to have none.
    new.no_expiry_reason := null;
  end if;
  return new;
end $fn$;

revoke all on function public.a_key_with_no_end_says_why() from public, anon, authenticated;

drop trigger if exists a_key_with_no_end_says_why on public.api_keys;
create trigger a_key_with_no_end_says_why
  before insert or update of expires_at on public.api_keys
  for each row execute function public.a_key_with_no_end_says_why();

-- ── 2 ── The dials ──────────────────────────────────────────────────────────
-- The console offers thirty, ninety, a hundred and eighty and three hundred
-- and sixty-five days; ninety is the one already selected when the dialog
-- opens. The number lives here rather than in the component, beside
-- dues_grace_days and notice_retention_days, so the owner can move it without
-- a deploy.
insert into public.club_settings (key, value_int, note) values
  ('api_key_days',        90, 'Days an API key runs for by default. The console preselects it; 30, 90, 180 and 365 are offered.'),
  ('api_key_stale_days',  90, 'A key with no end older than this is flagged in the keys console. Nothing is revoked; the flag is the whole control.'),
  ('api_key_warn_days',   14, 'First warning to the operator who cut a key, this many days before it stops.'),
  ('api_key_last_days',    3, 'Second and last warning before a key stops.')
on conflict (key) do nothing;

-- ── 3 ── The warning, twice ─────────────────────────────────────────────────

create table if not exists public.api_key_notices (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  ends_at    timestamptz not null,
  days_out   integer not null,
  sent_at    timestamptz not null default now(),
  primary key (api_key_id, ends_at, days_out)
);

comment on table public.api_key_notices is
  'Which warning went out about which key, keyed on the end date it was warned about. Move a key''s date and both rungs arm again; leave it and neither repeats.';

alter table public.api_key_notices enable row level security;
create policy "the bridge reads what it was told" on public.api_key_notices
  for select to authenticated using ((select public.is_staff()));
grant select on public.api_key_notices to authenticated;

create or replace function public.warn_of_expiring_keys()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  k     record;
  rung  record;
  told  record;
  sent  integer := 0;
  early integer := coalesce(public.club_setting('api_key_warn_days'), 14);
  late  integer := coalesce(public.club_setting('api_key_last_days'), 3);
begin
  for k in
    select a.id, a.label, a.prefix, a.expires_at, a.created_by
      from public.api_keys a
     where not a.revoked
       and a.expires_at is not null
       and a.expires_at > now()
       and a.expires_at <= now() + make_interval(days => greatest(early, late))
  loop
    -- One key at a time, in its own subtransaction. A key whose operator has
    -- since left, a notice that will not insert — none of it may take the run
    -- down and leave every other key unwarned. The idiom is the one every
    -- scheduled job in this schema uses since 2026-09-06.
    begin
      for rung in
        select distinct r.days_out from (values (early), (late)) as r(days_out)
         where k.expires_at <= now() + make_interval(days => r.days_out)
           and not exists (
             select 1 from public.api_key_notices n
              where n.api_key_id = k.id and n.ends_at = k.expires_at and n.days_out = r.days_out)
         order by r.days_out desc
      loop
        insert into public.api_key_notices (api_key_id, ends_at, days_out)
        values (k.id, k.expires_at, rung.days_out);

        -- Who hears it: the operator who cut the key, while they are still on
        -- the Bridge. When the key predates created_by, or that operator has
        -- gone, the whole Bridge hears it instead — an unowned key about to
        -- stop is everybody's.
        for told in
          select p.id
            from public.profiles p
           where p.is_staff
             and p.status <> 'departed'
             and (p.id = k.created_by
                  or not exists (select 1 from public.profiles c
                                  where c.id = k.created_by and c.is_staff and c.status <> 'departed'))
        loop
          insert into public.notifications (profile_id, kind, title, body, href)
          values (told.id, 'word',
                  'A key stops on ' || to_char(k.expires_at at time zone 'America/New_York', 'FMMon FMDD') || '.',
                  k.label || ' (' || k.prefix || '…) has ' ||
                    greatest(0, (k.expires_at::date - current_date)) ||
                    ' days left. Cut a replacement and hand it over, or give this one a later date, before whatever holds it goes quiet.',
                  '/bridge/keys');
        end loop;

        sent := sent + 1;
      end loop;
    exception when others then
      perform public.note_cron_skip('warn_of_expiring_keys', k.id::text, sqlerrm, sqlstate);
    end;
  end loop;

  return sent;
end $fn$;

revoke all on function public.warn_of_expiring_keys() from public, anon, authenticated;

comment on function public.warn_of_expiring_keys() is
  'Two warnings before an API key stops, in the club''s own Word, to the operator who cut it. Runs daily.';

-- Early on the club's clock, before the retention sweep and before anybody is
-- likely to be reading, so the word is waiting when they open the Bridge.
select cron.schedule('key-expiry-warnings', '0 13 * * *', $$select public.warn_of_expiring_keys()$$);

notify pgrst, 'reload schema';
