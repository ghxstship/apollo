-- The bow daybed has been a shelf product with no door: club_products carries
-- it at $1,500 for a group of four and nothing in the product could buy one,
-- so operations.md's "max 2 daybed groups" had nothing to enforce against.
-- (The membership kit says 4; operations §3 and the activity kit both say 2 —
-- two sources against one, as the format catalogue already ruled.)
--
-- A claim rides an aboard pass, is priced from the catalogue by the house —
-- the member states no price — and is counted under the sailing's own lock.
-- Releasing the pass releases the daybed (cascade) and the standing release
-- machinery credits the folio with everything the pass was charged.
create table public.voyage_daybeds (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  rsvp_id uuid not null references public.rsvps(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (rsvp_id)
);

alter table public.voyage_daybeds enable row level security;
create policy "your daybed, or the bridge's ledger" on public.voyage_daybeds
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy "the bridge may strike a daybed" on public.voyage_daybeds
  for delete to authenticated using (public.is_staff());
-- No INSERT policy: the only door is the RPC below.

create or replace function public.claim_a_daybed(p_rsvp uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  price integer;
  taken integer;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;

  select rv.id, rv.voyage_id, rv.profile_id, rv.status into r
  from public.rsvps rv where rv.id = p_rsvp and rv.profile_id = auth.uid();
  if r.id is null then raise exception 'that pass is not yours to build on'; end if;
  if r.status <> 'aboard' then
    raise exception 'a daybed rides an approved pass — board first';
  end if;

  select price_cents into price from public.club_products
  where slug = 'vip_daybed' and active;
  if price is null then raise exception 'the daybed is off the shelf this season'; end if;

  perform pg_advisory_xact_lock(hashtext('daybed:' || r.voyage_id::text));

  select count(*) into taken from public.voyage_daybeds where voyage_id = r.voyage_id;
  if taken >= 2 then
    raise exception 'two daybed groups a sailing — both are spoken for';
  end if;

  insert into public.voyage_daybeds (voyage_id, rsvp_id, profile_id)
  values (r.voyage_id, r.id, r.profile_id);

  insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
  values (r.profile_id, -price, 'addon', 'Bow daybed — group of four', r.voyage_id, r.id, r.profile_id);
end $$;

revoke execute on function public.claim_a_daybed(uuid) from public, anon;;
