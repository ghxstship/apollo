-- 1 ── A key can be given an end.
-- An un_… key opens the whole staff-visible read surface — the member roll,
-- lifetime value, per-episode pass lists with guest names — until somebody
-- thinks to revoke it. last_used_at tells an operator that only if they look.
--
-- The column is added WITHOUT a default, deliberately, against the advice that
-- came with it. A default of ninety days would put an invisible fuse in every
-- key minted from now on, and the keys console does not yet show a date or let
-- an operator choose one — so the first anybody would learn of it is an
-- integration going dark on a Tuesday. Enforcement lands now; choosing a
-- length is the console's job and the owner's call, and until then a key
-- behaves exactly as it does today.
alter table public.api_keys
  add column if not exists expires_at timestamptz;

comment on column public.api_keys.expires_at is
  'When the key stops opening anything. Null is a key with no end — the shape every key had before this column, and still the default until the Bridge can show and set a date.';

-- 2 ── A pass counts its devices under a lock before it adds one.
-- wallet_registrations took as many devices as anyone cared to register. The
-- application now caps it at eight, but that cap is count-then-write with
-- nothing holding the answer still — the exact shape a concurrency run found
-- four of and which the lock migration exists to eliminate. This is the sound
-- half: the count and the write happen under one lock, keyed on the pass, so
-- two members registering at once never wait on each other.
create or replace function public.cap_wallet_registrations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare held int; cap int := 8;
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
end;
$fn$;

revoke all on function public.cap_wallet_registrations() from public, anon, authenticated;

drop trigger if exists a_pass_is_on_a_bounded_number_of_devices on public.wallet_registrations;
create trigger a_pass_is_on_a_bounded_number_of_devices
  before insert on public.wallet_registrations
  for each row execute function public.cap_wallet_registrations();;
