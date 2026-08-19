-- ===== Tier 2/3: guests, transfers, promo codes, waitlist, push, sms, ops =====

-- Per-guest credentials: each guest gets a code and can arrive alone.
create table public.rsvp_guests (
  id uuid primary key default gen_random_uuid(),
  rsvp_id uuid not null references public.rsvps(id) on delete cascade,
  name text not null,
  boarding_code text unique,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.rsvp_guests (rsvp_id);
alter table public.rsvp_guests enable row level security;
create policy "members read guests" on public.rsvp_guests
  for select to authenticated using (true);
create policy "host manages own guests" on public.rsvp_guests
  for all to authenticated
  using (exists (select 1 from public.rsvps r where r.id = rsvp_id and (r.profile_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.rsvps r where r.id = rsvp_id and (r.profile_id = auth.uid() or public.is_staff())));

create or replace function public.sync_guest_rows()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int; nm text; code text; m text;
begin
  if new.status <> 'aboard' then return new; end if;
  delete from public.rsvp_guests g where g.rsvp_id = new.id
    and g.name <> all(coalesce(new.guest_names, '{}'));
  select member_no into m from public.profiles where id = new.profile_id;
  i := 0;
  foreach nm in array coalesce(new.guest_names, '{}') loop
    i := i + 1;
    if not exists (select 1 from public.rsvp_guests g where g.rsvp_id = new.id and g.name = nm) then
      code := coalesce(new.boarding_code, 'LS-GUEST') || '-G' || i::text;
      insert into public.rsvp_guests (rsvp_id, name, boarding_code) values (new.id, nm, code)
      on conflict (boarding_code) do nothing;
    end if;
  end loop;
  return new;
end $$;
create trigger on_rsvp_guest_sync
after insert or update of guest_names, status, boarding_code on public.rsvps
for each row execute function public.sync_guest_rows();
revoke execute on function public.sync_guest_rows() from public, anon, authenticated;

-- ===== Pass transfer between members (never resale) =====
create table public.pass_transfers (
  id uuid primary key default gen_random_uuid(),
  rsvp_id uuid not null references public.rsvps(id) on delete cascade,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
alter table public.pass_transfers enable row level security;
create policy "parties read transfers" on public.pass_transfers
  for select to authenticated using (from_profile = auth.uid() or to_profile = auth.uid() or public.is_staff());
create policy "offer own pass" on public.pass_transfers
  for insert to authenticated
  with check (from_profile = auth.uid() and exists (
    select 1 from public.rsvps r where r.id = rsvp_id and r.profile_id = auth.uid() and r.status = 'aboard'));
create policy "parties update transfers" on public.pass_transfers
  for update to authenticated using (from_profile = auth.uid() or to_profile = auth.uid() or public.is_staff());

create or replace function public.accept_pass_transfer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v record; net int;
begin
  select * into t from public.pass_transfers where id = p_id and status = 'offered';
  if t.id is null then raise exception 'no offer to accept'; end if;
  if t.to_profile <> auth.uid() then raise exception 'that offer is not yours'; end if;
  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id where r.id = t.rsvp_id;
  -- Credit what the sender paid, charge the receiver the same.
  select coalesce(-sum(delta_cents), 0) into net from public.account_ledger
   where rsvp_id = t.rsvp_id and delta_cents < 0;
  update public.rsvps set profile_id = t.to_profile, boarding_code = null, checked_in_at = null
   where id = t.rsvp_id;
  if net > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (t.from_profile, net, 'credit', 'Pass handed to a member — ' || v.title, v.id, t.rsvp_id),
           (t.to_profile, -net, 'berth', 'Pass taken over — ' || v.title, v.id, t.rsvp_id);
  end if;
  update public.pass_transfers set status = 'accepted', responded_at = now() where id = p_id;
  insert into public.notifications (profile_id, kind, title, body)
  values (t.from_profile, 'manifest', 'Your pass changed hands.',
          'It is off your manifest and your account is squared.');
end $$;
grant execute on function public.accept_pass_transfer(uuid) to authenticated;

-- ===== Promo / access codes at the pass level =====
create table public.promo_codes (
  code text primary key,
  kind text not null check (kind in ('percent','amount','comp')),
  value int not null default 0,
  voyage_id uuid references public.voyages(id) on delete cascade,
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
create policy "staff manage promo codes" on public.promo_codes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
alter table public.rsvps add column promo_code text references public.promo_codes(code);

create or replace function public.check_promo(p_code text, p_voyage uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.code is null then jsonb_build_object('ok', false, 'reason', 'No such code.')
    when not c.active then jsonb_build_object('ok', false, 'reason', 'That code is closed.')
    when c.uses >= c.max_uses then jsonb_build_object('ok', false, 'reason', 'That code is spent.')
    when c.expires_at is not null and c.expires_at < now() then jsonb_build_object('ok', false, 'reason', 'That code has expired.')
    when c.voyage_id is not null and c.voyage_id <> p_voyage then jsonb_build_object('ok', false, 'reason', 'That code is for another sailing.')
    else jsonb_build_object('ok', true, 'kind', c.kind, 'value', c.value) end
  from (select * from public.promo_codes where code = upper(p_code)) c
  right join (select 1) x on true;
$$;
grant execute on function public.check_promo(text, uuid) to authenticated;

-- ===== Waitlist: auto-claim + visible position =====
alter table public.rsvps add column auto_claim boolean not null default false;
create view public.waitlist_position with (security_invoker = on) as
select id as rsvp_id, voyage_id, profile_id,
       rank() over (partition by voyage_id order by created_at asc)::int as position
from public.rsvps where status = 'waitlist';

-- ===== Push + SMS channels =====
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "manage own push subs" on public.push_subscriptions
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.sms_outbox enable row level security;
create policy "staff read sms outbox" on public.sms_outbox
  for select to authenticated using (public.is_staff());

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.push_outbox enable row level security;
create policy "staff read push outbox" on public.push_outbox
  for select to authenticated using (public.is_staff());

-- Every Word becomes a push; urgent kinds also queue an SMS.
create or replace function public.fan_out_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.profiles where id = new.profile_id;
  insert into public.push_outbox (profile_id, title, body, url)
  values (new.profile_id, new.title, new.body,
          case new.kind when 'manifest' then '/manifest' when 'weather' then '/manifest'
               when 'fathoms' then '/portal' else '/word' end);
  if new.kind = 'weather' and p.phone is not null and p.phone_verified then
    insert into public.sms_outbox (to_phone, template, payload)
    values (p.phone, 'weather-hold', jsonb_build_object('title', new.title, 'body', new.body));
  end if;
  return new;
end $$;
create trigger on_notification_fanout
after insert on public.notifications
for each row execute function public.fan_out_notification();
revoke execute on function public.fan_out_notification() from public, anon, authenticated;

-- ===== Operator: saved segments, API keys, webhooks, automations =====
create table public.saved_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filters jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.saved_segments enable row level security;
create policy "staff manage segments" on public.saved_segments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes text[] not null default '{read}',
  revoked boolean not null default false,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create policy "staff manage api keys" on public.api_keys
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  events text[] not null default '{}',
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status int,
  error text,
  created_at timestamptz not null default now()
);
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
create policy "staff manage webhooks" on public.webhooks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff read deliveries" on public.webhook_deliveries
  for select to authenticated using (public.is_staff());

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_event text not null,
  conditions jsonb not null default '{}',
  action jsonb not null default '{}',
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.automations enable row level security;
create policy "staff manage automations" on public.automations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Engagement: activity per member for the operator CRM.
create view public.member_engagement with (security_invoker = on) as
select p.id as profile_id,
  (select count(*) from public.rsvps r where r.profile_id = p.id and r.status = 'aboard')::int as passes,
  (select count(*) from public.rsvps r where r.profile_id = p.id and r.checked_in_at is not null)::int as attended,
  (select count(*) from public.wardroom_posts w where w.author_id = p.id)::int as posts,
  (select coalesce(sum(f.delta),0) from public.fathoms_ledger f where f.profile_id = p.id)::int as knots,
  (select max(r.created_at) from public.rsvps r where r.profile_id = p.id) as last_booked_at
from public.profiles p;
