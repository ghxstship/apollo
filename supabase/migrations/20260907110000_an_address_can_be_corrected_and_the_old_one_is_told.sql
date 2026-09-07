-- A member could not change the address on file, and if anybody changed it for
-- them the club's own copy silently stopped matching.
--
-- Two findings with one root, both from the settings audit:
--
--   "Email change does not exist at all — the guard refuses the member, the
--   Bridge only reads it, updateUser is called for password only; rectification
--   is impossible in-product." That is GDPR Art. 16 in plain terms: a member
--   cannot correct the single most important thing the club holds about them.
--
--   "No auth.users UPDATE trigger, so profiles.email permanently diverges if
--   anyone edits the auth email in the dashboard." The address every letter is
--   sent to lives in public.profiles; the address that actually opens the
--   account lives in auth.users. Nothing kept them in step. Divergence is zero
--   today, which is the only comfortable moment to fix it.
--
-- The root is the same: the club treated the address as a thing Shoreside
-- edits, and then gave Shoreside no way to edit it that kept both copies true.
--
-- The provider owns the change. auth.updateUser({ email }) sends a
-- confirmation link and does not move anything until it is followed, which is
-- the property that matters — an address nobody has proved they can read is not
-- a recovery channel, it is a way to lose an account. What this file adds is
-- what happens AFTER the provider says yes: the club's copy follows, and the
-- mailbox that just lost the account is told.
--
-- ON SENDING TO BOTH. Confirming to the old address as well as the new is the
-- provider's `secure_email_change` setting, which lives in a dashboard and not
-- in this repository. It should be on. Independently of it, the letter below
-- goes to the OLD address when the change lands — so even with the setting off,
-- the mailbox losing the account hears about it from the club. That is the half
-- that catches somebody quietly walking off with a membership.

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_name text;
begin
  if lower(coalesce(new.email, '')) = lower(coalesce(old.email, '')) then
    return new;
  end if;

  /* The guard on profiles refuses an email change by design — "the address on
     file changes through Shoreside, not from here" — so this announces itself
     the way every other permitted path does, with a setting the guard reads.
     Set for this statement only. */
  perform set_config('app.sync_email', 'on', true);
  update public.profiles set email = new.email where id = new.id
  returning full_name into v_name;
  perform set_config('app.sync_email', 'off', true);

  /* The mailbox that has just lost the account is told, at the address it is
     losing. Not a courtesy: an address change is how an account is stolen
     quietly, and the old mailbox is the only place the rightful holder is
     certain to be reading.

     Wrapped, because this runs inside the provider's own transaction. A letter
     that will not queue must not be the reason a confirmed address change
     fails — the member would be left with a confirmation they followed and an
     account that did not move. */
  begin
    if old.email is not null and old.email <> '' then
      insert into public.email_outbox (to_email, template, payload)
      values (old.email, 'email-changed', jsonb_build_object(
        'name', v_name,
        'at', to_char(now() at time zone public.club_zone(), 'FMDay FMDD FMMonth, FMHH12:MIam')
      ));
    end if;
  exception when others then
    null;
  end;

  return new;
end $fn$;

revoke all on function public.sync_profile_email_from_auth() from public, anon, authenticated;

comment on function public.sync_profile_email_from_auth() is
  'Keeps public.profiles.email in step with the address that actually opens the account, and tells the old mailbox when it changes. Fires after the provider has confirmed the new address — the provider owns the confirmation, because an address nobody has proved they can read is not a recovery channel. Never raises: a letter that will not queue must not undo a change the member already confirmed.';

drop trigger if exists an_address_change_follows_through on auth.users;
create trigger an_address_change_follows_through
after update of email on auth.users
for each row execute function public.sync_profile_email_from_auth();

-- The guard learns the one permitted path, in the idiom it already uses for
-- the feed rotation, the phone verification and the processor handle.
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if new.status_set_by is distinct from old.status_set_by
     or new.status_set_at is distinct from old.status_set_at then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.hold_reason is distinct from old.hold_reason then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.member_no is distinct from old.member_no then
    raise exception 'a member number is issued once';
  end if;
  /* The address follows the provider, and only the provider. A member changes
     it by confirming a link; this column is where that lands, never where it
     starts. */
  if new.email is distinct from old.email
     and coalesce(current_setting('app.sync_email', true), 'off') <> 'on' then
    raise exception 'the address on file follows the one you sign in with — change it from your settings and confirm the link';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token
     and coalesce(current_setting('app.rotate_feed', true), 'off') <> 'on' then
    raise exception 'the season feed rotates from the control on your member card, not by hand';
  end if;
  if new.phone_verified is distinct from old.phone_verified
     and new.phone_verified is distinct from false
     and coalesce(current_setting('app.verify_phone', true), 'off') <> 'on' then
    raise exception 'a number is verified by answering it, not by saying so';
  end if;
  if new.comped_until is distinct from old.comped_until then
    raise exception 'complimentary dues are the Bridge''s to give';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;
  return new;
end;
$fn$;

insert into public.email_templates (code, description, active, rule_can_send) values
  ('email-changed', 'Sent to a member''s OLD address when the address on their account changes.', true, false)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
