-- ---- audit_log: every mutation of money-moving reference data, attributed ---
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_table_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy "the bridge reads the log" on public.audit_log
  for select to authenticated using (public.is_staff());

create or replace function public.record_the_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare b jsonb; a jsonb; rid text;
begin
  if tg_op in ('UPDATE','DELETE') then b := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then a := to_jsonb(new); end if;
  rid := coalesce(a->>'id', b->>'id', a->>'slug', b->>'slug', a->>'key', b->>'key');
  if tg_op = 'UPDATE' and a = b then return new; end if;
  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (tg_table_name, rid, tg_op, auth.uid(), b, a);
  return coalesce(new, old);
end $$;
revoke execute on function public.record_the_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['voyages','sponsors','voyage_sponsors','seasons','venues','voyage_series',
                           'voyage_daybeds','club_settings','sponsor_tiers','club_products',
                           'membership_plans','activity_formats','voyage_segment_caps','cabins']
  loop
    execute format('create trigger zz_record_the_change after insert or update or delete on public.%I
                    for each row execute function public.record_the_change()', t);
  end loop;
end $$;

alter table public.sponsors
  add column created_by uuid references public.profiles(id) on delete set null default auth.uid();

alter table public.account_ledger
  add constraint account_ledger_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null not valid;

-- ---- the ledger outlives the member ------------------------------------------
alter table public.club_settings disable trigger zz_record_the_change;
insert into public.club_settings (key, value_int, note) values
  ('outbox_retention_days',  90, 'Sent, skipped and failed outbox rows are purged after this many days'),
  ('departed_erasure_days',  30, 'A departed profile is anonymised after this many days'),
  ('signature_retention_years', 6, 'Signatures and counter-signatures are redacted after this many years')
on conflict (key) do nothing;
alter table public.club_settings enable trigger zz_record_the_change;

create or replace function public.stamp_member_ref()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.member_ref is null and new.profile_id is not null then
    select member_no into new.member_ref from public.profiles where id = new.profile_id;
  end if;
  return new;
end $$;
revoke execute on function public.stamp_member_ref() from public, anon, authenticated;

do $$
declare
  t text; con text;
begin
  foreach t in array array['account_ledger','fathoms_ledger','invoices','subscriptions','payment_methods',
                           'installment_plans','shop_orders','galley_orders','reward_redemptions'] loop
    execute format('alter table public.%I add column if not exists member_ref text', t);
    execute format('update public.%I x set member_ref = p.member_no from public.profiles p where p.id = x.profile_id and x.member_ref is null', t);
    execute format('create trigger a_stamp_member_ref before insert on public.%I for each row execute function public.stamp_member_ref()', t);
    con := t || '_profile_id_fkey';
    execute format('alter table public.%I drop constraint %I', t, con);
    execute format('alter table public.%I alter column profile_id drop not null', t);
    execute format('alter table public.%I add constraint %I foreign key (profile_id) references public.profiles(id) on delete set null', t, con);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('api_keys','created_by','api_keys_created_by_fkey'),
    ('applications','reviewed_by','applications_reviewed_by_fkey'),
    ('member_roll','approved_by','member_roll_approved_by_fkey'),
    ('promo_codes','created_by','promo_codes_created_by_fkey'),
    ('rsvp_guests','checked_in_by','rsvp_guests_checked_in_by_fkey'),
    ('rsvp_guests','seated_by','rsvp_guests_seated_by_fkey'),
    ('rsvps','checked_in_by','rsvps_checked_in_by_fkey'),
    ('saved_segments','created_by','saved_segments_created_by_fkey'),
    ('wardroom_flags','resolved_by','wardroom_flags_resolved_by_fkey'),
    ('counter_signatures','signed_by','counter_signatures_signed_by_fkey')
  ) as v(t, c, con) loop
    execute format('alter table public.%I drop constraint %I', r.t, r.con);
    execute format('alter table public.%I alter column %I drop not null', r.t, r.c);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null', r.t, r.con, r.c);
  end loop;
end $$;

-- ---- retention: outboxes, counter-signatures, departed profiles -------------
create or replace function public.erase_departed_profiles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  with gone as (
    update public.profiles p
       set full_name = 'Departed member',
           handle = null,
           email = null,
           phone = null,
           phone_verified = false,
           bio = null,
           interests = '{}',
           stripe_customer_id = null,
           in_directory = false,
           on_manifest = false,
           calendar_token = gen_random_uuid(),
           notification_prefs = '{}'::jsonb
     where p.status = 'departed'
       and p.status_set_at is not null
       and p.status_set_at < now() - make_interval(days => public.club_setting('departed_erasure_days'))
       and p.full_name is distinct from 'Departed member'
    returning p.id
  )
  select count(*) into n from gone;
  delete from public.push_subscriptions s
  using public.profiles p
  where s.profile_id = p.id and p.status = 'departed' and p.full_name = 'Departed member';
  return n;
end $$;
revoke execute on function public.erase_departed_profiles() from public, anon, authenticated;

create or replace function public.cron_purge_expired_records()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare keep interval := make_interval(days => public.club_setting('outbox_retention_days'));
begin
  perform public.purge_expired_signatures_unattended(public.club_setting('signature_retention_years'));
  perform public.purge_spent_identity_unattended();
  update public.counter_signatures
     set signed_ip = null, user_agent = null
   where signed_at < now() - make_interval(years => public.club_setting('signature_retention_years'))
     and (signed_ip is not null or user_agent is not null);
  delete from public.email_outbox where status <> 'pending' and created_at < now() - keep;
  delete from public.sms_outbox   where status <> 'pending' and created_at < now() - keep;
  delete from public.push_outbox  where status <> 'pending' and created_at < now() - keep;
  perform public.erase_departed_profiles();
end $$;

-- ---- the member's own copy of their record ----------------------------------
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'calendar_token' - 'stripe_customer_id' - 'is_staff' - 'status_set_by'
                from public.profiles p where p.id = auth.uid()),
    'passes', (select coalesce(jsonb_agg(to_jsonb(r) - 'boarding_code'), '[]'::jsonb) from public.rsvps r where r.profile_id = auth.uid()),
    'account_ledger', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.account_ledger l where l.profile_id = auth.uid()),
    'knots_ledger', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.fathoms_ledger f where f.profile_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.notifications n where n.profile_id = auth.uid()),
    'proposals', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.member_event_proposals m where m.proposer_id = auth.uid()),
    'preference_sheet', (select to_jsonb(s) from public.preference_sheets s where s.profile_id = auth.uid()),
    'agreements', (select coalesce(jsonb_agg(jsonb_build_object('document_version_id', g.document_version_id, 'signed_at', g.signed_at)), '[]'::jsonb)
                   from public.signatures g where g.profile_id = auth.uid())
  );
$$;
grant execute on function public.export_my_data() to authenticated;

-- ---- a dead outbox row can be put back in the water --------------------------
create or replace function public.requeue_outbox_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_table not in ('email_outbox','sms_outbox','push_outbox') then
    raise exception 'that is not an outbox';
  end if;
  execute format('update public.%I set status = ''pending'', attempts = 0, next_attempt_at = now(), last_error = null
                  where id = $1 and status in (''failed'',''skipped'')', p_table) using p_id;
end $$;
grant execute on function public.requeue_outbox_row(text, uuid) to authenticated;

-- ---- the flotilla is levelled in one statement -------------------------------
create or replace function public.assign_vessels_evenly(p_voyage uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  with hulls as (
    select vv.vessel_id, row_number() over (order by vv.position, vv.vessel_id) - 1 as k, count(*) over () as total
    from public.voyage_vessels vv where vv.voyage_id = p_voyage
  ), loose as (
    select r.id, row_number() over (order by r.created_at) - 1 as k
    from public.rsvps r
    where r.voyage_id = p_voyage and r.status = 'aboard' and r.vessel_id is null and r.cabin_id is null
  )
  update public.rsvps r set vessel_id = h.vessel_id
  from loose l join hulls h on h.k = (l.k % h.total)
  where r.id = l.id;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.assign_vessels_evenly(uuid) to authenticated;

-- ---- stripe events, remembered -----------------------------------------------
create table public.stripe_events (
  id text primary key,
  type text not null,
  created timestamptz not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
create policy "the bridge reads the stripe log" on public.stripe_events
  for select to authenticated using (public.is_staff());

-- ---- an on-request format has a door ----------------------------------------
create table public.charter_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  format text references public.activity_formats(slug) on update cascade on delete set null,
  party_size integer check (party_size is null or party_size between 1 and 96),
  preferred_dates text check (coalesce(char_length(preferred_dates), 0) <= 200),
  note text check (coalesce(char_length(note), 0) <= 2000),
  status text not null default 'submitted' check (status in ('submitted','answered','declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (coalesce(char_length(decision_note), 0) <= 1000),
  created_at timestamptz not null default now()
);
create index charter_requests_profile_idx on public.charter_requests (profile_id, created_at desc);
alter table public.charter_requests enable row level security;
create policy "a member raises their own request" on public.charter_requests
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active() and status = 'submitted' and decided_by is null);
create policy "a member reads their own requests" on public.charter_requests
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "a member withdraws a standing request" on public.charter_requests
  for delete to authenticated using ((profile_id = auth.uid() and status = 'submitted') or public.is_staff());
create policy "the bridge answers requests" on public.charter_requests
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
grant insert, update, delete on public.charter_requests to authenticated;;
