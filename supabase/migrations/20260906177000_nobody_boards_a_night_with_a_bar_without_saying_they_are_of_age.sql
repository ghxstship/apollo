-- The waiver contemplated a minor aboard and nothing ever asked an age.
--
-- The guest waiver has a guardian line in its clause text, there is no age
-- verification anywhere, no vetting gate on a guest, and nothing in the galley
-- order path consults an age predicate -- while galley_items sells category
-- 'bar': a paloma, a beer. The product has no notion of a date of birth at all,
-- which is why one exposure is really two: below thirteen it is COPPA scope,
-- and at the bar it is state alcohol law and the club's own licence.
--
-- The owner's ruling of 2026-09-06: no guest under twenty-one aboard an episode
-- that serves alcohol, asked and refused at the waiver rather than at the
-- gangway. This file is that rule.
--
-- An attestation, not a date of birth. The club does not need to know how old
-- somebody is, only that they are old enough, and collecting a birth date it
-- has no use for would be a category of personal data acquired for nothing --
-- exactly what a retention schedule is supposed to prevent. So the guest says
-- yes or no, the answer is kept with the signature that carries it, and the
-- club holds no birthday it would then have to erase.
--
-- Null is not false and is not true. A guest row created before this file, or
-- one whose waiver is unsigned, has not been asked -- which must refuse
-- boarding on a night with a bar rather than assume either way.

alter table public.galley_items
  add column if not exists min_age integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'a_minimum_age_is_a_plausible_one') then
    alter table public.galley_items add constraint a_minimum_age_is_a_plausible_one
      check (min_age is null or (min_age between 1 and 120));
  end if;
end $$;

comment on column public.galley_items.min_age is
  'The age somebody must attest to before this item may be served to them. NULL is no minimum -- most of the galley. Set for anything alcoholic, and it is the column that decides whether an episode counts as a night with a bar.';

update public.galley_items set min_age = 21 where category = 'bar' and min_age is null;

alter table public.pass_guests
  add column if not exists of_age boolean;

comment on column public.pass_guests.of_age is
  'Whether this guest attested to being old enough for the night they are joining. NULL means not asked -- which is neither yes nor no, and is refused at boarding on any night with a bar. Deliberately an attestation and not a date of birth: the club needs to know that somebody is old enough, not how old they are, and a birthday it has no use for is personal data it would only have to erase later.';

insert into public.club_settings (key, value_int, note) values
  ('guest_minimum_age', 21,
   'The age a guest attests to before boarding a night that serves alcohol. Twenty-one by the owner''s ruling of 2026-09-06, which is the licence''s figure rather than the law''s floor -- the club does not run two rules for one room.')
on conflict (key) do nothing;

-- ── Does this night have a bar? ─────────────────────────────────────────────

create or replace function public.episode_serves_alcohol(p_episode uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  /* Read off the galley rather than a flag on the episode. A flag is a second
     place to say the same thing and would be wrong the first week somebody
     added a beer without ticking it; the items themselves are the fact. */
  select exists (
    select 1 from public.galley_items g
     where g.active and g.min_age is not null
  );
$fn$;

revoke all on function public.episode_serves_alcohol(uuid) from public, anon;
grant execute on function public.episode_serves_alcohol(uuid) to authenticated, service_role;

comment on function public.episode_serves_alcohol(uuid) is
  'Whether the night in question has anything on it that carries a minimum age. Derived from the galley rather than from a flag on the episode: a flag would be a second place to state the same fact and wrong the first week somebody added a beer without ticking it. The episode argument is taken for the day the galley is per-episode -- today it is one list for the club, and the signature is what will not have to change then.';

-- ── The refusal ─────────────────────────────────────────────────────────────

create or replace function public.a_guest_says_they_are_of_age()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_episode uuid;
  v_min integer := coalesce(public.club_setting('guest_minimum_age'), 21);
begin
  /* Only at the moment of boarding. A guest may be named, and their waiver may
     be sent, long before anybody knows whether they will come -- refusing the
     row itself would mean a member could not add a guest until the guest had
     answered, which puts the club between two people having a conversation. */
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select r.episode_id into v_episode from public.passes r where r.id = new.rsvp_id;
  if v_episode is null or not public.episode_serves_alcohol(v_episode) then
    return new;
  end if;

  if new.of_age is not true then
    raise exception 'there is a bar tonight, so every guest says they are % or over before they board — this one has not', v_min
      using errcode = '53400';
  end if;
  return new;
end $fn$;

revoke all on function public.a_guest_says_they_are_of_age() from public, anon, authenticated;

comment on function public.a_guest_says_they_are_of_age() is
  'Refuses to check in a guest who has not attested to the club''s minimum age, on a night that serves alcohol. Fires at boarding rather than when the guest is named, because a member should be able to add a guest before that guest has answered anything. NULL refuses: not asked is not the same as old enough.';

drop trigger if exists a_guest_boards_having_said_their_age on public.pass_guests;
create trigger a_guest_boards_having_said_their_age
before update on public.pass_guests
for each row execute function public.a_guest_says_they_are_of_age();

notify pgrst, 'reload schema';
