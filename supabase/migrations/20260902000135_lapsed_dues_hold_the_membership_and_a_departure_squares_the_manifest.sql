-- DECISION (2026-09-01, reversible): dues that lapse hold the membership.
-- past_due keeps its grace ("settle in the portal and nothing else changes");
-- canceled or unpaid places a club hold with hold_reason 'dues' that only a
-- clearing payment lifts. A paused membership keeps its future passes (they
-- are paid for and releasable). A DEPARTED member's future passes are released
-- with full credit whatever the window — the club said goodbye, it does not
-- also keep the money.
alter table public.profiles add column if not exists hold_reason text
  check (hold_reason is null or hold_reason in ('dues','conduct','club'));

create or replace function public.handle_subscription_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('active','trialing') then
    -- A dues hold lifts with the payment; any other hold stands.
    update public.profiles
       set status = case when status = 'paused' and hold_reason is distinct from 'dues' then status else 'active' end,
           hold_reason = case when hold_reason = 'dues' then null else hold_reason end,
           plan_id = coalesce(new.plan_id, plan_id)
     where id = new.profile_id and status <> 'departed';
  elsif new.status = 'paused' then
    update public.profiles
       set status = 'paused', status_set_by = id
     where id = new.profile_id;
  elsif new.status = 'past_due' and old.status in ('active','trialing') then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'word', 'Dues did not clear.',
            'The card was declined. Settle in the portal and nothing else changes.');
  elsif new.status in ('canceled','unpaid') and old.status in ('active','trialing','past_due') then
    update public.profiles
       set status = 'paused', hold_reason = 'dues', status_set_by = null
     where id = new.profile_id and status <> 'departed';
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'word', 'Membership held — dues lapsed.',
            'Booking, posting and contests are closed until dues clear. Settle in the portal and the hold lifts on its own; a word to Shoreside does the same.');
  end if;
  return new;
end $$;

create or replace function public.handle_profile_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; owed integer;
begin
  if new.status = 'departed' and old.status <> 'departed' then
    -- Every future pass comes off the manifest, credited in full: the release
    -- machinery credits only outside the window, so the inside-window balance
    -- is credited here first, and the release then finds nothing further owed.
    for r in select rv.id, rv.voyage_id from public.rsvps rv join public.voyages v on v.id = rv.voyage_id
             where rv.profile_id = new.id and rv.status = 'aboard' and v.starts_at > now()
               and v.status in ('scheduled','live','weather_hold') loop
      select coalesce(-sum(l.delta_cents), 0) into owed from public.account_ledger l
      where l.profile_id = new.id and l.voyage_id = r.voyage_id;
      if owed > 0 then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
        values (new.id, owed, 'credit', 'Departed — pass credited in full', r.voyage_id, r.id);
      end if;
      update public.rsvps set status = 'not_going' where id = r.id;
    end loop;
    insert into public.email_outbox (to_email, template, payload)
    select new.email, 'farewell', jsonb_build_object('name', new.full_name) where new.email is not null;
  elsif new.status = 'paused' and old.status <> 'paused' and new.hold_reason is distinct from 'dues' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Your membership is paused.',
            'Knots and tier keep. Passes you hold stay held — release them from the manifest if the tide has turned. Resume with a word.');
  elsif new.status = 'active' and old.status = 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Your membership is running again.',
            'The pause is lifted. Booking, posting and contests are open, and dues pick up where they left off.');
  end if;
  return new;
end $$;;
