-- `status_set_by is distinct from id` was meant to protect a hold the CLUB
-- placed from being lifted by a payment event. It does. It also means a hold
-- the MEMBER placed — where status_set_by IS id — falls through to 'active'.
--
-- The webhook upserts status on every subscription event, so the trigger fires
-- on any renewal. A member who paused their own membership has that pause
-- quietly undone the next time their card is charged, without asking them and
-- without telling them. They come back to a membership they had stopped.
--
-- A pause is a pause whoever placed it. What differs is who may LIFT it, and
-- set_own_standing already gets that right: a member may lift their own, and is
-- told to hail Shoreside for one the club placed. Nothing about a card clearing
-- is an instruction to come back.
create or replace function public.handle_subscription_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status in ('active','trialing') then
    update public.profiles
       set status = case when status = 'paused' then status else 'active' end,
           plan_id = coalesce(new.plan_id, plan_id)
     where id = new.profile_id and status <> 'departed';
  elsif new.status = 'paused' then
    update public.profiles
       set status = 'paused', status_set_by = id
     where id = new.profile_id;
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
$function$;
;
