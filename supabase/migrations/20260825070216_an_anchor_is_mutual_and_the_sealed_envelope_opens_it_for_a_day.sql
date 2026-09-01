-- The other half of Radar: what a mutual pick becomes, how it is opened, and
-- what happens when there is nothing to open.

-- First, a correction to the migration before this one. radar_activity was
-- granted to `authenticated`, which put a per-sailing pick count in front of
-- every member -- and the kit's rule is that a one-sided pick is "never
-- surfaced, hinted at, or counted". A volume figure a member can read is a
-- count. There is no version of that view that is worth the rule, so it goes.
drop view if exists public.radar_activity;

-- ── Shared Anchors ─────────────────────────────────────────────────────────
-- `matches` already models a mutual pick and cannot be reused: it is unique on
-- (profile_a, profile_b) GLOBALLY, so two members who anchor on Sailing 04 could
-- never anchor again on Sailing 09 -- the insert would silently do-nothing. For
-- a weekly sailing with a 24-hour contact that is not a near miss, it is the
-- opposite of the product.
create table if not exists public.shared_anchors (
  id          uuid primary key default gen_random_uuid(),
  voyage_id   uuid not null references public.voyages(id) on delete cascade,
  rsvp_a      uuid not null references public.rsvps(id) on delete cascade,
  rsvp_b      uuid not null references public.rsvps(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unlocked_at timestamptz,
  expires_at  timestamptz not null,
  constraint shared_anchor_ordered_pair check (rsvp_a < rsvp_b),
  unique (voyage_id, rsvp_a, rsvp_b)
);

comment on table public.shared_anchors is
  'A mutual pick, keyed on passes so a couple is one anchor. Created at pick time, invisible until the envelope is opened at 19:00, and gone 24 hours later on both sides.';

alter table public.shared_anchors enable row level security;

-- The whole ceremony is in this policy. The row is written the moment the second
-- pick lands -- around 17:20 -- and if it were readable then, a member could
-- poll PostgREST and know their match two hours before the Chief Vibe Stew says
-- it out loud, which is the product.
--
-- `unlocked_at is not null` is the envelope. `now() < expires_at` is the 24
-- hours, enforced by making the contact stop existing rather than by a client
-- countdown reaching zero: "no extension and no reminder" means the row goes
-- dark on both sides at the same instant, with nothing to appeal to.
drop policy if exists "an anchor surfaces once it is opened" on public.shared_anchors;
create policy "an anchor surfaces once it is opened" on public.shared_anchors
  for select to authenticated using (
    (unlocked_at is not null and now() < expires_at and exists (
      select 1 from public.rsvps r
      where r.id in (shared_anchors.rsvp_a, shared_anchors.rsvp_b)
        and r.profile_id = auth.uid()
    ))
    or public.is_staff()
  );

-- No member INSERT, UPDATE or DELETE policy at all. An anchor is a consequence,
-- not an action: it is written by the mutual trigger and opened by the envelope
-- RPC, both SECURITY DEFINER. A member who could delete one could delete the
-- other side's too.
drop policy if exists "staff clear an anchor" on public.shared_anchors;
create policy "staff clear an anchor" on public.shared_anchors
  for delete to authenticated using (public.is_staff());

-- ── Mutual only ────────────────────────────────────────────────────────────
-- The shape of match_on_mutual_pick, at pass grain: look for the reciprocal row,
-- and if it is there, write the anchor. Nothing is written for a one-sided pick
-- and no notification goes out at pick time -- the reveal is at 19:00, from a
-- sealed envelope, and a push at 17:20 saying "you have a match" would be the
-- ceremony leaking through the notifications table.
create or replace function public.anchor_on_mutual_pick()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a uuid; b uuid; ends_at timestamptz;
begin
  if not exists (
    select 1 from public.radar_picks p
    where p.voyage_id = new.voyage_id
      and p.picker_rsvp = new.picked_rsvp
      and p.picked_rsvp = new.picker_rsvp
  ) then
    return new;
  end if;

  a := least(new.picker_rsvp, new.picked_rsvp);
  b := greatest(new.picker_rsvp, new.picked_rsvp);
  select anchors_expire_at into ends_at from public.voyage_radar where voyage_id = new.voyage_id;

  insert into public.shared_anchors (voyage_id, rsvp_a, rsvp_b, expires_at)
  values (new.voyage_id, a, b, ends_at)
  on conflict (voyage_id, rsvp_a, rsvp_b) do nothing;

  return new;
end $$;

drop trigger if exists on_radar_pick_anchor on public.radar_picks;
create trigger on_radar_pick_anchor
  after insert on public.radar_picks
  for each row execute function public.anchor_on_mutual_pick();

-- ── The sealed envelope ────────────────────────────────────────────────────
-- "CAPTAIN'S LOG QR UNLOCKS AT 19:00." The token is what is printed inside the
-- gold-foil envelope handed over at the dock, so it lives in a table a member
-- cannot read. Putting it on `rsvps` instead would mean the member could fetch
-- their own token from PostgREST and open the log without ever holding the
-- envelope -- which is not a QR code, it is a button with extra steps.
--
-- Note this is the opposite discipline to rsvps.boarding_code, which is stored
-- plainly on purpose because a doorman matches it literally. This one is a
-- bearer secret and is never shown to the person it belongs to.
create table if not exists public.captains_log_envelopes (
  rsvp_id   uuid primary key references public.rsvps(id) on delete cascade,
  token     uuid not null unique default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  opened_at timestamptz
);

comment on table public.captains_log_envelopes is
  'The bearer token printed inside the sealed Captain''s Log envelope. Staff-only: a member who could read their own token would not need the envelope.';

alter table public.captains_log_envelopes enable row level security;

drop policy if exists "the envelope is sealed" on public.captains_log_envelopes;
create policy "the envelope is sealed" on public.captains_log_envelopes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.open_the_captains_log(p_token uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  env    record;
  clock  record;
  opened integer;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;

  select e.*, r.voyage_id, r.profile_id
  into env
  from public.captains_log_envelopes e
  join public.rsvps r on r.id = e.rsvp_id
  where e.token = p_token;

  if env.rsvp_id is null then raise exception 'that envelope is not one of ours'; end if;
  if env.profile_id <> auth.uid() then
    raise exception 'that envelope belongs to another guest';
  end if;

  select * into clock from public.voyage_radar where voyage_id = env.voyage_id;
  if clock.voyage_id is null then raise exception 'radar does not run on this sailing'; end if;
  if now() < clock.anchors_unlock_at then
    raise exception 'the log opens at 19:00';
  end if;
  if now() >= clock.anchors_expire_at then
    -- Named, and not softened. The kit is explicit that there is no extension
    -- and no reminder, so a message that implies an appeal exists would be a
    -- lie told at the worst moment.
    raise exception 'the twenty-four hours are up — the contacts are gone on both sides';
  end if;

  update public.captains_log_envelopes set opened_at = coalesce(opened_at, now())
  where rsvp_id = env.rsvp_id;

  -- Opening YOUR envelope opens YOUR side of the anchor. The other guest's
  -- envelope is theirs to open; the row carries one unlocked_at because the
  -- contact is the pair, and the reveal is simultaneous by design -- both sides
  -- were told 19:00.
  update public.shared_anchors
  set unlocked_at = coalesce(unlocked_at, now())
  where voyage_id = env.voyage_id
    and (rsvp_a = env.rsvp_id or rsvp_b = env.rsvp_id);
  get diagnostics opened = row_count;

  return opened;
end $$;

comment on function public.open_the_captains_log(uuid) is
  'Opens the anchors on one pass, from the bearer token in the sealed envelope. Refuses before 19:00 and after the 24 hours, both by name.';

revoke all on function public.open_the_captains_log(uuid) from public, anon;
grant execute on function public.open_the_captains_log(uuid) to authenticated;

-- Every seated pass on a Radar sailing gets an envelope, because the crew prints
-- forty of them at once and an unprinted one is a guest at the dock with nothing
-- in their hand.
create or replace function public.issue_the_envelopes(p_voyage uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare issued integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  insert into public.captains_log_envelopes (rsvp_id)
  select r.id from public.rsvps r
  where r.voyage_id = p_voyage and r.status = 'aboard'
  on conflict (rsvp_id) do nothing;
  get diagnostics issued = row_count;
  return issued;
end $$;

revoke all on function public.issue_the_envelopes(uuid) from public, anon;
grant execute on function public.issue_the_envelopes(uuid) to authenticated;

-- ── The Match Guarantee ────────────────────────────────────────────────────
-- "$150 credit toward next sailing if zero mutual matches", auto-triggered at
-- docking, "no form, no request".
--
-- Two decisions the kit does not make.
--
-- One: it requires at least one pick. As written, "leaving slots open costs you
-- nothing" plus a guarantee that pays out on zero anchors is a $150 rebate on a
-- $350 pass available to anyone who plots nothing — a 43% discount for
-- inaction, which would be discovered within one season and would then be the
-- product. The guarantee covers a member who tried and was not met; it is not a
-- price. The refusal copy on the surface names this, because a member who
-- plotted nothing and expected the credit has to be told why rather than left
-- to conclude the promise was broken.
--
-- Two: a couple pass gets ONE credit, not two. The pass is one unit everywhere
-- else in this module — one pin, one anchor — and paying it twice would make the
-- couple the only place the unit splits.
--
-- Fires only where a voyage_radar row exists, which means it is inert on every
-- sailing already in this database. That containment is deliberate: this is a
-- money path on a shared production account.
create or replace function public.settle_the_match_guarantee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  clock record;
  paid  integer := 0;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;

  select * into clock from public.voyage_radar where voyage_id = new.id;
  if clock.voyage_id is null or clock.settled_at is not null then return new; end if;

  -- idem_key is unique-indexed on this table by an earlier migration, so a
  -- second run of this branch cannot pay twice however many times a status is
  -- flipped back and forth.
  insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, idem_key)
  select r.profile_id, 15000, 'credit',
         'Match Guarantee — no shared anchors on this sailing.',
         new.id, r.id,
         'match-guarantee:' || new.id::text || ':' || r.id::text
  from public.rsvps r
  where r.voyage_id = new.id and r.status = 'aboard'
    and exists (select 1 from public.radar_picks p
                where p.voyage_id = new.id and p.picker_rsvp = r.id)
    and not exists (select 1 from public.shared_anchors a
                    where a.voyage_id = new.id and (a.rsvp_a = r.id or a.rsvp_b = r.id))
  on conflict (idem_key) do nothing;
  get diagnostics paid = row_count;

  insert into public.notifications (profile_id, kind, title, body)
  select r.profile_id, 'word', 'No anchors this time',
         'That happens, and it is on us. A $150 credit is already on your next sailing — no form, no request.'
  from public.rsvps r
  join public.account_ledger l on l.rsvp_id = r.id
    and l.idem_key = 'match-guarantee:' || new.id::text || ':' || r.id::text
  where r.voyage_id = new.id and l.created_at > now() - interval '1 minute';

  update public.voyage_radar set settled_at = now() where voyage_id = new.id;
  return new;
end $$;

comment on function public.settle_the_match_guarantee() is
  'Posts the $150 Match Guarantee credit to every pass that plotted a course and drew no anchor. One credit per pass, so a couple is paid once. Inert on any sailing with no voyage_radar row.';

drop trigger if exists on_voyage_settle_the_guarantee on public.voyages;
create trigger on_voyage_settle_the_guarantee
  after update of status on public.voyages
  for each row execute function public.settle_the_match_guarantee();;
