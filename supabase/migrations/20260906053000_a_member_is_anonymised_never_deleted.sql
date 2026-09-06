-- Decision 1. A member is anonymised, never deleted.
--
-- Today a profile delete cascades into passes, and every account_ledger line
-- that named the member and the pass loses BOTH keys at once: the charge
-- survives as money owed by nobody. The same delete nulls the member off their
-- own signatures, their invoices, their subscription and their plans.
--
-- Every regime that touches this says the same thing. A charge must stay
-- attributable, an electronic signature must stay associated with its signer,
-- and the erasure right people cite as the counter-argument carves out records
-- kept for legal claims. The pattern is anonymise in place: keep the row and
-- its relationships, replace what identifies the person.
--
-- The club already built exactly that. erase_departed_profiles() rewrites name,
-- handle, email, phone, bio, interests and the calendar token thirty days after
-- a member departs, and it never deletes a row. Nothing in the application
-- deletes a profile either; the only DELETE in the suite is a member trying to
-- remove somebody else, which the policy already refuses. So this migration
-- does not remove a capability anybody uses. It closes the door that was
-- standing open beside the one everybody walks through.
--
-- TWO CORRECTIONS to the audit that raised this, recorded because the second
-- changes what needed fixing.
--
-- First, the signatures are in better shape than reported. The table
-- denormalises signer_name, signer_email, rendered_body, rendered_hash,
-- consent_text, signed_at, signed_ip and user_agent onto the row, and
-- signatures.guest_id already RESTRICTs. A signature is therefore evidence
-- standing alone and does not depend on the profile key to be attributable.
-- The key is restricted here anyway, because a record about a person should
-- name that person, but it was never the emergency.
--
-- Second, "45 signatures hang off guests with no pass" describes the normal
-- state and not an accident: 285 of 290 guests have no pass, because
-- pass_guests.rsvp_id is SET NULL BY DESIGN so a guest and their waiver
-- outlive the booking. That stays exactly as it is.
--
-- What is restricted here is the SUBJECT of a record — the member it is about.
-- What is deliberately left alone is the ACTOR — who checked someone in, who
-- posted a line, who redacted a signature. A deed survives its doer, and
-- nulling the actor loses nothing the record needs.

-- The pass itself. Cascading it away is what took the ledger's second key.
alter table public.passes drop constraint rsvps_profile_id_fkey;
alter table public.passes add constraint rsvps_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.pass_credits drop constraint pass_credits_profile_id_fkey;
alter table public.pass_credits add constraint pass_credits_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

-- The money. A line must always name the member it charged.
alter table public.account_ledger drop constraint account_ledger_profile_id_fkey;
alter table public.account_ledger add constraint account_ledger_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.invoices drop constraint invoices_profile_id_fkey;
alter table public.invoices add constraint invoices_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.subscriptions drop constraint subscriptions_profile_id_fkey;
alter table public.subscriptions add constraint subscriptions_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.installment_plans drop constraint installment_plans_profile_id_fkey;
alter table public.installment_plans add constraint installment_plans_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.shop_orders drop constraint shop_orders_profile_id_fkey;
alter table public.shop_orders add constraint shop_orders_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.galley_orders drop constraint galley_orders_profile_id_fkey;
alter table public.galley_orders add constraint galley_orders_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.payment_methods drop constraint payment_methods_profile_id_fkey;
alter table public.payment_methods add constraint payment_methods_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

-- The signed record. Its subject, not its redactor.
alter table public.signatures drop constraint signatures_profile_id_fkey;
alter table public.signatures add constraint signatures_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.counter_signatures drop constraint counter_signatures_signed_by_fkey;
alter table public.counter_signatures add constraint counter_signatures_signed_by_fkey
  foreign key (signed_by) references public.profiles(id) on delete restrict;

comment on constraint rsvps_profile_id_fkey on public.passes is
  'Restrict, not cascade. A pass carries a charge, sometimes a deposit and sometimes a signature; deleting the member used to take all of it and leave the money owed by nobody. A member is anonymised in place by erase_departed_profiles().';

-- And a sentence where the refusal will actually be read.
--
-- profiles.id cascades from auth.users, so deleting the auth user is the same
-- act by another door — and with the keys above restricted it now fails with a
-- constraint name, at an operator in a dashboard who has no way to know why.
-- No client can reach this: profiles carries no DELETE policy at all, so
-- PostgREST refuses first and the suite's "a member cannot delete another
-- member" still comes back silent and empty. This speaks to the service role
-- and to whoever is holding the dashboard.
--
-- It refuses every delete, not only the ones carrying money. A member with no
-- charges is still a member record, and "it works for some people" is a worse
-- rule to hold in your head than "it never works, here is what to do instead".
create or replace function public.a_member_is_anonymised_never_deleted()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a member is anonymised, not deleted: set their status to departed and erase_departed_profiles() rewrites the record after % days, keeping the money and the signatures attributable',
    coalesce(public.club_setting('departed_erasure_days'), 30)
    using errcode = '23503';
end $fn$;

revoke all on function public.a_member_is_anonymised_never_deleted() from public, anon, authenticated;

drop trigger if exists a_member_is_anonymised_never_deleted on public.profiles;
create trigger a_member_is_anonymised_never_deleted
  before delete on public.profiles
  for each row execute function public.a_member_is_anonymised_never_deleted();
