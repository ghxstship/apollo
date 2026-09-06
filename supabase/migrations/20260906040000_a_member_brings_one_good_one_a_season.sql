-- The invite had a ceiling and no allowance. `invites_one_live_per_inviter`
-- (2026-09-06) closed the loop that let a member hold a hundred codes, and in
-- closing it took the only path a member had: /you offers Mint ONLY when the
-- read comes back empty, so a member whose code was signed sees the spent code
-- for ever and no way to ask for another. The rule the club actually wants is
-- one live code at a time AND a count per season that deepens with tenure —
-- neither of which a policy can express, because both need a count and a
-- lookup rather than a predicate on the incoming row.
--
-- Four things land here.
--
-- AN INVITE HAS AN END. `expires_at`, ninety days by the `invite_expiry_days`
-- dial. Existing codes are NOT backdated: nobody was told about an expiry when
-- they minted, so the clock starts when this rule does. An expired code is
-- refused at the door (validate_invite, apply_with_invite) and does not stand
-- between its holder and a replacement.
--
-- THE INDEX LEARNS THE WORD RETIRED. A partial index predicate must be
-- immutable, so it cannot read now() and cannot know an expiry. `retired_at`
-- is the immutable half of the same fact: mint_invite retires an expired code
-- before it writes the new one, and the index counts only what is unretired
-- and still has a signature in it. One live code at a time, unchanged.
--
-- A SEASON IS THE THING WE COUNT AGAINST. Not a rolling window invented here.
-- public.seasons is a real table with real dates and the member page already
-- reads it; invite_season resolves the same one /season does — the member's
-- home city's, else a club-wide one, else the earliest — narrowed to the
-- season whose days actually contain today, on that city's own clock. Between
-- seasons there is no allowance to draw on, and the club says so rather than
-- inventing a window.
--
-- THE COUNT IS A TRIGGER, NOT A POLICY, AND THE FRONT DOOR IS A DEFINER. A
-- WITH CHECK sees the incoming row and nothing else, so it can ask that the
-- row be yours, active, unspent and well shaped — and can never ask how many
-- you have minted since September. The obvious move is to drop the policy and
-- route everything through a definer, and it is the wrong one: it closes the
-- table to every other honest writer and makes the rule live in one function
-- that a future caller can simply not use. So both. `guard_the_invite_allowance`
-- fires BEFORE INSERT for EVERY writer and counts; `mint_invite` is the door
-- the app knocks on, and it does the things a trigger cannot — retire the code
-- that ran out its days, and refuse in sentences rather than at a constraint.

-- ── The dials ───────────────────────────────────────────────────────────────
-- Ordinal keys rather than league names: the ladder's names are the club's to
-- change and this mapping should survive them. Values are the owner's, and are
-- dials precisely so nobody needs a deploy to move them.
insert into public.club_settings (key, value_int, note) values
  ('invite_expiry_days',            90, 'An invite code is good for this many days after it is minted'),
  ('invite_season_cap_league_one',   1, 'Invites a First League member may mint in one season'),
  ('invite_season_cap_league_two',   1, 'Invites a Second League member may mint in one season'),
  ('invite_season_cap_league_three', 2, 'Invites a Third League member may mint in one season'),
  ('invite_season_cap_league_four',  2, 'Invites a Fourth League member may mint in one season'),
  ('invite_season_cap_league_five',  3, 'Invites a Fifth League member may mint in one season')
on conflict (key) do nothing;

-- ── The code's end, and the word retired ────────────────────────────────────
alter table public.invites
  add column if not exists expires_at timestamptz,
  add column if not exists retired_at timestamptz;

-- Not backdated. See the header: the clock starts with the rule.
update public.invites
   set expires_at = now() + (public.club_setting('invite_expiry_days') || ' days')::interval
 where expires_at is null;

alter table public.invites
  alter column expires_at set default (now() + (public.club_setting('invite_expiry_days') || ' days')::interval);
alter table public.invites
  alter column expires_at set not null;

comment on column public.invites.expires_at is
  'When the code stops being good. Ninety days from minting by default, and a code past it can neither be redeemed nor stand in the way of a replacement.';
comment on column public.invites.retired_at is
  'Set when a replacement was minted over an expired code. The immutable half of live: an index predicate cannot read now(), so this is what tells it the code is done.';

drop index if exists public.invites_one_live_per_inviter;
create unique index invites_one_live_per_inviter
  on public.invites (inviter_id) where (uses < max_uses and retired_at is null);

comment on index public.invites_one_live_per_inviter is
  'A member holds one invite that still has a signature left in it and has not been retired. A spent or retired code does not block a new one; two live codes at once is what this refuses.';

-- ── An expired code is not a code ───────────────────────────────────────────
-- Both doors an applicant can present a code at. Deliberately NOT
-- accept_application, which SPENDS the signature and pays the inviter: the
-- code was presented when the application was written, and an applicant who
-- was in time should not lose their introduction because the Bridge read the
-- file in March. Expiry is checked where a member is told, not where a
-- reviewer is.
create or replace function public.validate_invite(p_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(p_code))
      and uses < max_uses
      and expires_at > now()
  );
$$;

comment on function public.validate_invite(text) is
  'Is this code good — unspent and inside its ninety days? Nothing more; it used to answer with the inviter''s name, to anyone who asked.';

create or replace function public.apply_with_invite(
  p_full_name text, p_email text, p_city text, p_note text, p_code text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid; v_valid boolean;
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'a name, as the manifest should read it';
  end if;
  if char_length(v_email) < 5 or char_length(v_email) > 254 or position('@' in v_email) < 2 then
    raise exception 'an address we can reach you at';
  end if;
  if coalesce(char_length(v_city), 0) > 120 then
    raise exception 'that city name is too long';
  end if;
  if coalesce(char_length(v_note), 0) > 2000 then
    raise exception 'keep it to a couple of thousand characters';
  end if;

  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(coalesce(p_code, '')))
      and uses < max_uses
      and expires_at > now()
  ) into v_valid;

  insert into public.applications (full_name, email, city, note, invite_code, status)
  values (v_name, v_email, v_city, v_note,
          case when v_valid then upper(btrim(p_code)) else null end, 'received')
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Which season a member's allowance is counted in ─────────────────────────
-- The same resolution /season makes, said once so the page and the gate cannot
-- disagree: the member's home city's season first, a club-wide one second, the
-- earliest otherwise. Narrowed to a season whose days contain this moment on
-- the season city's own clock — a member in Miami and a member in Chicago are
-- each in their own year, and a season that closed last August is not one
-- anybody's allowance renews in.
create or replace function public.invite_season(p_profile uuid)
returns table (season_id uuid, title text, starts_on date, ends_on date, zone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id, s.title, s.starts_on, s.ends_on, coalesce(c.time_zone, 'America/New_York')
    from public.seasons s
    left join public.cities c on c.id = s.city_id
   where s.active
     and now() >= (s.starts_on::timestamp at time zone coalesce(c.time_zone, 'America/New_York'))
     and now() <  ((s.ends_on + 1)::timestamp at time zone coalesce(c.time_zone, 'America/New_York'))
   order by
     (s.city_id is not null
        and s.city_id = (select p.home_city from public.profiles p where p.id = p_profile)) desc,
     (s.city_id is null) desc,
     s.starts_on
   limit 1;
$$;

comment on function public.invite_season(uuid) is
  'The season a member''s invite allowance is counted in: their home city''s, else the club-wide one, else the earliest — and always one whose days contain today on its own city clock.';

revoke execute on function public.invite_season(uuid) from public;
grant execute on function public.invite_season(uuid) to authenticated;

-- ── What the member may do, and why not ─────────────────────────────────────
-- Facts, not a sentence: the You page owns the words, because the words have to
-- pass the lexicon gate and be testable without a database. This answers how
-- many, out of how many, in which season, and until when.
create or replace function public.invite_allowance(p_profile uuid default null)
returns table (
  season_title    text,
  season_ends_on  date,
  league          integer,
  cap             integer,
  minted          integer,
  live_code       text,
  live_expires_at timestamptz,
  may_mint        boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me  uuid := auth.uid();
  who uuid := coalesce(p_profile, auth.uid());
  sn  record;
  lg  integer;
  v_cap integer;
  v_minted integer := 0;
  v_live record;
begin
  -- Both halves said plainly rather than leaned on. `who <> me` is NULL when
  -- there is no session, and a NULL guard is a guard that never fires — so an
  -- unauthenticated caller reaching this function with a profile id in hand
  -- would have sailed straight past it. The grant already refuses anon; this
  -- refuses it again, here, where the reasoning is visible.
  if me is null then raise exception 'sign in first'; end if;
  if who is null then raise exception 'sign in first'; end if;
  if who <> me and not public.is_staff() then
    raise exception 'that allowance is not yours to read';
  end if;

  select * into sn from public.invite_season(who);
  select ml.league into lg from public.member_league ml where ml.profile_id = who;
  lg := coalesce(lg, 1);

  v_cap := coalesce(public.club_setting(
    case lg
      when 1 then 'invite_season_cap_league_one'
      when 2 then 'invite_season_cap_league_two'
      when 3 then 'invite_season_cap_league_three'
      when 4 then 'invite_season_cap_league_four'
      else        'invite_season_cap_league_five'
    end), 1);

  if sn.season_id is not null then
    select count(*) into v_minted
      from public.invites i
     where i.inviter_id = who
       and i.created_at >= (sn.starts_on::timestamp at time zone sn.zone)
       and i.created_at <  ((sn.ends_on + 1)::timestamp at time zone sn.zone);
  end if;

  select i.code, i.expires_at into v_live
    from public.invites i
   where i.inviter_id = who
     and i.retired_at is null
     and i.uses < i.max_uses
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  return query select
    sn.title,
    sn.ends_on,
    lg,
    v_cap,
    v_minted::integer,
    v_live.code,
    v_live.expires_at,
    (sn.season_id is not null
       and v_live.code is null
       and v_minted < v_cap
       -- The standing of the member being asked about, not of the person
       -- asking: a staff reader looking at someone else's allowance must be
       -- told whether THEIR mint is open, and is_active() answers only for
       -- the caller.
       and coalesce((select p.status = 'active' from public.profiles p where p.id = who), false));
end;
$function$;

comment on function public.invite_allowance(uuid) is
  'The member''s invite standing: the season it is counted in, their league, the cap that league carries, how many they have minted in it, the live code if they hold one, and whether the mint is open to them.';

revoke execute on function public.invite_allowance(uuid) from public;
grant execute on function public.invite_allowance(uuid) to authenticated;

-- ── The mint ────────────────────────────────────────────────────────────────
-- The code is still made in the app, with crypto-strength randomness and
-- nothing of the inviter in it (2026-08-23). What moves here is the DECIDING:
-- the shape, the standing, the one-live rule, the retirement of a code that
-- has run out its ninety days, and the count against the season. The advisory
-- lock is on the member, so two taps a second apart cannot both read a count
-- of zero and both write.
create or replace function public.mint_invite(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me     uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  sn     record;
  lg     integer;
  v_cap  integer;
  v_minted integer;
begin
  if me is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;
  -- The shape the retired INSERT policy asked for, carried forward whole.
  if v_code !~ '^[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'that is not the shape of an invite code';
  end if;

  perform pg_advisory_xact_lock(hashtext('invite:' || me::text));

  select * into sn from public.invite_season(me);
  if sn.season_id is null then
    raise exception 'the club is between seasons, so there is no allowance to draw an invite from';
  end if;

  -- A code that ran out its days stops standing in the way of the next one.
  update public.invites
     set retired_at = now()
   where inviter_id = me
     and retired_at is null
     and uses < max_uses
     and expires_at <= now();

  if exists (
    select 1 from public.invites
     where inviter_id = me and retired_at is null and uses < max_uses and expires_at > now()
  ) then
    raise exception 'you already hold an invite with a signature left in it';
  end if;

  select ml.league into lg from public.member_league ml where ml.profile_id = me;
  lg := coalesce(lg, 1);
  v_cap := coalesce(public.club_setting(
    case lg
      when 1 then 'invite_season_cap_league_one'
      when 2 then 'invite_season_cap_league_two'
      when 3 then 'invite_season_cap_league_three'
      when 4 then 'invite_season_cap_league_four'
      else        'invite_season_cap_league_five'
    end), 1);

  select count(*) into v_minted
    from public.invites i
   where i.inviter_id = me
     and i.created_at >= (sn.starts_on::timestamp at time zone sn.zone)
     and i.created_at <  ((sn.ends_on + 1)::timestamp at time zone sn.zone);

  if v_minted >= v_cap then
    raise exception 'that is the whole of your invite allowance for %', sn.title;
  end if;

  -- Named here rather than left to the primary key, so the app can tell a
  -- taken code (roll again) from a rule (stop and say so).
  if exists (select 1 from public.invites i where i.code = v_code) then
    raise exception 'that code is taken' using errcode = '23505';
  end if;

  insert into public.invites (code, inviter_id) values (v_code, me);
  return v_code;
end;
$function$;

comment on function public.mint_invite(text) is
  'Mints one invite for the calling member if their league''s allowance for this season has room and they hold no live code. The app supplies the random code; every rule lives here.';

revoke execute on function public.mint_invite(text) from public;
grant execute on function public.mint_invite(text) to authenticated;

-- The backstop. `mint own invite` stays exactly as it is — it is right about
-- everything it can see — and this counts the thing it cannot. Without it a
-- member could POST straight to the table and mint past their allowance, one
-- code at a time, for ever, and mint_invite would be a suggestion.
--
-- A row whose minute falls in no season is in no season's allowance and is not
-- counted here. That is not a loophole: mint_invite refuses to make one, so
-- nothing the app does lands outside a season. It is the club's own seeding,
-- which predates the seasons table by two months, being left alone.
create or replace function public.guard_the_invite_allowance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sn record;
  lg integer;
  v_cap integer;
  v_minted integer;
begin
  select * into sn from public.invite_season(new.inviter_id);
  if sn.season_id is null then return new; end if;

  select ml.league into lg from public.member_league ml where ml.profile_id = new.inviter_id;
  lg := coalesce(lg, 1);
  v_cap := coalesce(public.club_setting(
    case lg
      when 1 then 'invite_season_cap_league_one'
      when 2 then 'invite_season_cap_league_two'
      when 3 then 'invite_season_cap_league_three'
      when 4 then 'invite_season_cap_league_four'
      else        'invite_season_cap_league_five'
    end), 1);

  select count(*) into v_minted
    from public.invites i
   where i.inviter_id = new.inviter_id
     and i.created_at >= (sn.starts_on::timestamp at time zone sn.zone)
     and i.created_at <  ((sn.ends_on + 1)::timestamp at time zone sn.zone);

  if v_minted >= v_cap then
    raise exception 'that is the whole of your invite allowance for %', sn.title;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_the_invite_allowance on public.invites;
create trigger guard_the_invite_allowance
  before insert on public.invites
  for each row execute function public.guard_the_invite_allowance();

comment on function public.guard_the_invite_allowance() is
  'Counts a member''s invites in the season the new one falls in and refuses the one past their league''s allowance. The count a WITH CHECK cannot make, made for every writer.';

comment on table public.invites is
  'A member''s code for bringing one good one. Minted only through mint_invite: one live at a time, ninety days on the clock, and a per-season count that deepens with the league.';
