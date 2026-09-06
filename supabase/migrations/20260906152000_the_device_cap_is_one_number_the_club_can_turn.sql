-- The wallet device cap was six in two places and nothing held them together.
--
-- a_pass_counts_six_devices_and_a_phone_that_stopped_asking_is_let_go
-- (2026-09-06) set the ceiling at six and wrote it twice: `cap int := 6` inside
-- cap_wallet_registrations, and MAX_DEVICES_PER_PASS in
-- src/lib/wallet/registrations.ts. Each carries a comment telling the reader to
-- change the other, which is the arrangement every codebase has tried and none
-- has kept. Nothing enforces it — no gate, no test, no constraint — so the day
-- the owner says eight, one of the two moves and the other does not, and the
-- failure is quiet in the direction that matters: the application says yes, the
-- trigger says no, and the member gets a five hundred instead of a sentence.
--
-- The club already has an idiom for a number two places need, and this file is
-- the last figure on the wallet path that was not using it. club_settings holds
-- the hull ceiling, the pause budget, the release window, the invite allowance
-- and the staleness this same sweep reads. The device cap joins them:
-- wallet_devices_per_pass, one row, read by the trigger directly and by the
-- application through club_setting() on the one path that adds a device.
--
-- Both readers coalesce to six. A settings row can be struck, and a database
-- replayed from an older point in the corpus has one moment where the function
-- exists and the row does not; a cap that reads NULL is `held >= null`, which is
-- NULL, which is not true, which is a trigger that has silently stopped
-- counting. Six is the fallback on both sides so a missing row cannot let the
-- two disagree — and the trigger stays the authority either way, because it is
-- the half that counts under the advisory lock.
--
-- Nothing about the ceiling itself changes. Six today, six after this file, and
-- six is a hygiene control rather than an anti-sharing one: the boarding code is
-- the credential and the gangway is what stops a second person using it. What
-- changes is that six is now a dial the Bridge turns rather than a literal in
-- two languages.

insert into public.club_settings (key, value_int, note)
values ('wallet_devices_per_pass', 6,
        'How many devices one pass may be listening on. Hygiene, not an anti-sharing control — it bounds the APNs fan-out that fires on every subscription event. Read by cap_wallet_registrations and by the PassKit web service.')
on conflict (key) do nothing;

create or replace function public.cap_wallet_registrations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  held int;
  -- Six was a literal here and in the application. Now the club's own dial,
  -- with the literal kept only as the answer to a missing row: a NULL cap makes
  -- `held >= cap` NULL, and a trigger that raises nothing is a trigger that is
  -- not there.
  cap int := coalesce(public.club_setting('wallet_devices_per_pass'), 6);
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

comment on function public.cap_wallet_registrations() is
  'Bounds the devices one pass may be listening on, at club_setting(''wallet_devices_per_pass'') and six if that row is missing. Counts under an advisory lock on the pass, so two devices registering in the same instant cannot both read the same count and both write. The PassKit web service reads the same dial and refuses first, in a sentence; this is what holds when it cannot.';

notify pgrst, 'reload schema';
