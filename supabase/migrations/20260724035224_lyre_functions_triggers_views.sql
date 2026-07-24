-- New auth user -> profile + welcome fathoms + welcome word
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_member_no text;
begin
  new_member_no := 'LYR-' || lpad(nextval('public.member_no_seq')::text, 4, '0');
  insert into public.profiles (id, email, full_name, member_no)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    new_member_no
  );
  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (new.id, 100, 'Welcome aboard');
  insert into public.notifications (profile_id, kind, title, body)
  values (new.id, 'word', 'Welcome aboard.', 'Your berth in the club is set. The manifest arrives each Sunday.');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- First confirmed RSVP on a voyage earns fathoms
create or replace function public.handle_rsvp_aboard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'aboard' and not exists (
    select 1 from public.fathoms_ledger
    where profile_id = new.profile_id and voyage_id = new.voyage_id and reason = 'Berth confirmed'
  ) then
    insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
    values (new.profile_id, 25, 'Berth confirmed', new.voyage_id);
    insert into public.notifications (profile_id, kind, title, body)
    select new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
           'Berth confirmed. Gangway details land 48 hours before departure.'
    from public.voyages v where v.id = new.voyage_id;
  end if;
  return new;
end;
$$;

create trigger on_rsvp_aboard
after insert or update of status on public.rsvps
for each row execute function public.handle_rsvp_aboard();

-- Capacity per voyage (security invoker so RLS of the querying user applies)
create view public.voyage_capacity
with (security_invoker = on) as
select
  v.id as voyage_id,
  v.berths_total,
  count(r.id) filter (where r.status = 'aboard') as aboard,
  count(r.id) filter (where r.status = 'waitlist') as waitlisted,
  greatest(v.berths_total - count(r.id) filter (where r.status = 'aboard'), 0) as berths_left
from public.voyages v
left join public.rsvps r on r.voyage_id = v.id
group by v.id, v.berths_total;

-- Fathoms balance per member
create view public.fathoms_balance
with (security_invoker = on) as
select profile_id, coalesce(sum(delta), 0)::int as balance
from public.fathoms_ledger
group by profile_id;
