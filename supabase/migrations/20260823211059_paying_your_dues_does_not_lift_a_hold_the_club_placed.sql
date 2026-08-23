-- The hold survived every route a member could take directly — set_own_standing
-- refuses it, PATCHing profiles refuses it — and then a billing event undid it.
-- handle_subscription_status sets status='active' for any subscription that
-- goes active or trialing, with no regard for who placed the hold. The Stripe
-- webhook writes exactly that on customer.subscription.updated and invoice.paid,
-- so a member held for conduct resumed their dues in the Stripe portal and the
-- hold was gone — a member-initiated action, undoing a Bridge decision.
--
-- Dues and standing are different things. Paying restores the dues; only
-- Shoreside restores the standing.
create or replace function public.handle_subscription_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('active','trialing') then
    update public.profiles
       set status = case
             -- A hold placed by the club stays until the club lifts it.
             when status = 'paused' and status_set_by is distinct from id then status
             else 'active'
           end,
           plan_id = coalesce(new.plan_id, plan_id)
     where id = new.profile_id and status <> 'departed';
  elsif new.status = 'paused' then
    update public.profiles set status = 'paused' where id = new.profile_id;
  elsif new.status in ('canceled','past_due') and old.status in ('active','trialing') then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'word',
      case when new.status = 'past_due' then 'Dues did not clear.' else 'Membership closed.' end,
      case when new.status = 'past_due'
           then 'The card was declined. Settle in the portal and nothing else changes.'
           else 'Your dues have lapsed. A word to Shoreside puts you back on the water.' end);
  end if;
  return new;
end
$$;

-- A table seat is a place on a night you are booked on. Entitlement was tested
-- when the seat was claimed and never again, so releasing the pass — and taking
-- the credit — left the seat confirmed and the roster readable. Confirm a chair
-- at every table of the evening, release, and keep the lot.
create or replace function public.crew_seat_follows_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' or old.status = 'aboard' then
    if not exists (
      select 1 from public.rsvps r
      where r.profile_id = old.profile_id and r.voyage_id = old.voyage_id
        and r.status = 'aboard' and r.id <> old.id
    ) then
      delete from public.thread_members tm
      using public.threads t
      where tm.thread_id = t.id
        and t.kind = 'crew'
        and t.voyage_id = old.voyage_id
        and tm.profile_id = old.profile_id;

      -- The chair goes with the pass.
      delete from public.table_seats ts
      using public.dating_tables dt
      where dt.id = ts.table_id
        and dt.voyage_id = old.voyage_id
        and ts.profile_id = old.profile_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- And the roster read is re-tested, not merely granted once at claim time.
create or replace function public.at_table(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.table_seats
    where table_id = p_table
      and profile_id = auth.uid()
      and state = 'confirmed'
  ) and public.has_a_pass_for_the_table(p_table);
$$;;
