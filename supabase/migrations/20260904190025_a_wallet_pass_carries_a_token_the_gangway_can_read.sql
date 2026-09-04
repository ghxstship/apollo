-- A wallet pass cannot rotate, so it carries a durable token behind a URL. One
-- live token per member; revoking is the way back from a pass that got out.
-- touched_at is the instant the pass last changed — the PassKit web service's
-- Last-Modified and passesUpdatedSince read it. From the 2026-09-04 wallet
-- build (docs/WALLET.md), with two additions for the schema invariants: the
-- registrations table has a reader policy rather than none, and the door role
-- may verify a token as well as staff.
create table if not exists public.wallet_tokens (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  touched_at timestamptz not null default now(),
  constraint a_wallet_token_is_revoked_after_it_is_issued
    check (revoked_at is null or revoked_at >= issued_at)
);
create unique index if not exists wallet_tokens_one_live_per_member
  on public.wallet_tokens (profile_id) where revoked_at is null;
create index if not exists wallet_tokens_by_member on public.wallet_tokens (profile_id, issued_at desc);
alter table public.wallet_tokens enable row level security;
create policy "your own wallet token" on public.wallet_tokens
  for select to authenticated using (profile_id = auth.uid());
grant select on public.wallet_tokens to authenticated;
revoke insert, update, delete on public.wallet_tokens from anon, authenticated;

create or replace function public.issue_wallet_token()
returns table (token uuid, profile_id uuid, issued_at timestamptz, revoked_at timestamptz, touched_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  return query
    select t.token, t.profile_id, t.issued_at, t.revoked_at, t.touched_at
      from public.wallet_tokens t
     where t.profile_id = v_uid and t.revoked_at is null;
  if found then return; end if;
  return query
    insert into public.wallet_tokens as w (profile_id)
    values (v_uid)
    returning w.token, w.profile_id, w.issued_at, w.revoked_at, w.touched_at;
end;
$$;

create or replace function public.revoke_wallet_token()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  update public.wallet_tokens t set revoked_at = now()
   where t.profile_id = v_uid and t.revoked_at is null;
end;
$$;

-- The gangway's three states, and only three — the same contract as
-- verify_member_qr(). Unknown and revoked are one answer on purpose.
create or replace function public.verify_wallet_token(p_token uuid)
returns table (state text, profile_id uuid, full_name text, member_no text, standing text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row record;
begin
  if not public.is_door() then raise exception 'staff only'; end if;
  select t.profile_id, t.revoked_at, p.full_name, p.member_no, p.status
    into v_row
  from public.wallet_tokens t
  join public.profiles p on p.id = t.profile_id
  where t.token = p_token;
  if v_row.profile_id is null or v_row.revoked_at is not null then
    return query select 'void'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;
  return query select
    case when v_row.status = 'active' then 'aboard' else 'hold' end,
    v_row.profile_id, v_row.full_name, v_row.member_no, v_row.status;
end;
$$;

revoke all on function public.issue_wallet_token() from public, anon;
revoke all on function public.revoke_wallet_token() from public, anon;
revoke all on function public.verify_wallet_token(uuid) from public, anon;
grant execute on function public.issue_wallet_token() to authenticated;
grant execute on function public.revoke_wallet_token() to authenticated;
grant execute on function public.verify_wallet_token(uuid) to authenticated;

create or replace function public.a_standing_change_touches_the_wallet_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status
     or new.tier is distinct from old.tier
     or new.plan_id is distinct from old.plan_id
     or new.full_name is distinct from old.full_name
     or new.member_no is distinct from old.member_no
     or new.home_city is distinct from old.home_city then
    update public.wallet_tokens t set touched_at = now()
     where t.profile_id = new.id and t.revoked_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.a_standing_change_touches_the_wallet_pass() from public, anon, authenticated;
drop trigger if exists a_standing_change_touches_the_wallet_pass on public.profiles;
create trigger a_standing_change_touches_the_wallet_pass
  after update on public.profiles
  for each row execute function public.a_standing_change_touches_the_wallet_pass();

-- Which phones hold which pass. Written only by the PassKit web service with
-- the service role after the pass's own authentication token was checked; the
-- Bridge may read it.
create table if not exists public.wallet_registrations (
  device_id text not null,
  pass_type text not null,
  serial uuid not null references public.profiles(id) on delete cascade,
  push_token text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, pass_type, serial)
);
create index if not exists wallet_registrations_by_pass on public.wallet_registrations (pass_type, serial);
alter table public.wallet_registrations enable row level security;
create policy "the bridge reads which phones hold a pass" on public.wallet_registrations
  for select to authenticated using (public.is_staff());
grant select on public.wallet_registrations to authenticated;
revoke insert, update, delete on public.wallet_registrations from anon, authenticated;

notify pgrst, 'reload schema';;
