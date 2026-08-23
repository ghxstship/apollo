-- profiles.phone_verified was not in the privileged-column guard, so a member
-- could PATCH it to true on any number they liked. fan_out_notification sends
-- weather traffic to sms_outbox whenever a profile has a phone and
-- phone_verified — so self-attestation let a member point platform texts at an
-- arbitrary third party's number, with no verification anywhere in the app.
--
-- The number stays the member's to change; the claim that it has been verified
-- does not. Changing the number also clears the claim.
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if new.is_staff is distinct from old.is_staff then
    raise exception 'staff standing is not yours to grant';
  end if;
  if new.tier is distinct from old.tier then
    raise exception 'membership tier moves from the Bridge, not from here';
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('app.set_standing', true), 'off') <> 'on' then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.member_no is distinct from old.member_no then
    raise exception 'a member number is issued once';
  end if;
  if new.email is distinct from old.email then
    raise exception 'the address on file changes through the gangway';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token then
    raise exception 'the season feed rotates from your member card, not by hand';
  end if;
  if new.phone_verified is distinct from old.phone_verified
     and coalesce(current_setting('app.verify_phone', true), 'off') <> 'on' then
    raise exception 'a number is verified by answering it, not by saying so';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;
  return new;
end;
$function$;

create or replace function public.unverify_on_phone_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.phone is distinct from old.phone then
    perform set_config('app.verify_phone', 'on', true);
    new.phone_verified := false;
    perform set_config('app.verify_phone', 'off', true);
  end if;
  return new;
end;
$$;

revoke execute on function public.unverify_on_phone_change() from public, anon, authenticated;

drop trigger if exists unverify_on_phone_change on public.profiles;
create trigger unverify_on_phone_change
  before update of phone on public.profiles
  for each row execute function public.unverify_on_phone_change();
