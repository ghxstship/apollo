-- push_outbox: the drain claims a row by setting status='sending' before the
-- Push API call, and this CHECK never admitted the word — every claim would
-- have failed the moment a member held a push subscription. email and sms
-- already allow it.
alter table public.push_outbox drop constraint push_outbox_status_check;
alter table public.push_outbox add constraint push_outbox_status_check
  check (status in ('pending','sending','sent','skipped','failed'));

-- A drop that opens after the boat has left is a sailing nobody can ever book.
alter table public.voyages add constraint a_drop_opens_before_the_boat_leaves
  check (sale_opens_at is null or sale_opens_at <= starts_at);

-- The format column carried two foreign keys to the same catalogue (an older
-- RESTRICT one and the program wave's SET NULL one). One rule, one name.
alter table public.voyages drop constraint if exists voyages_format_fkey;

-- A proposal that becomes a sailing should be able to say which.
alter table public.member_event_proposals
  add column voyage_id uuid references public.voyages(id) on delete set null;

-- The daybed's terms live on the product row, not in a literal in the RPC and
-- another in the member's screen.
alter table public.club_products
  add column per_sailing_cap integer check (per_sailing_cap is null or per_sailing_cap > 0),
  add column party_size integer check (party_size is null or party_size > 0);
update public.club_products set per_sailing_cap = 2, party_size = 4 where slug = 'vip_daybed';

-- Hot paths every rsvp/transfer trigger nets by, and the pollers.
create index if not exists account_ledger_rsvp_id_idx on public.account_ledger (rsvp_id) where rsvp_id is not null;
create index if not exists account_ledger_voyage_profile_idx on public.account_ledger (voyage_id, profile_id) where voyage_id is not null;
create index if not exists fathoms_ledger_voyage_profile_idx on public.fathoms_ledger (voyage_id, profile_id) where voyage_id is not null;
create index if not exists push_outbox_pending_idx on public.push_outbox (created_at) where status = 'pending';
create index if not exists email_outbox_pending_idx on public.email_outbox (created_at) where status = 'pending';
create index if not exists sms_outbox_pending_idx on public.sms_outbox (created_at) where status = 'pending';
create index if not exists pass_transfers_open_offer_idx on public.pass_transfers (rsvp_id) where status = 'offered';
create index if not exists installment_plans_due_idx on public.installment_plans (next_charge_at) where status = 'active';
create index if not exists rsvps_voyage_status_idx on public.rsvps (voyage_id, status);;
