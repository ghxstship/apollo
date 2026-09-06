-- 1 ── Two constraint-trigger functions shipped with Postgres's default PUBLIC
-- EXECUTE. The schema holds an invariant that a trigger function is granted to
-- nobody, because it is reached through the write it guards and never called
-- directly. Same correction as a_posted_line_does_not_move.
revoke all on function public.an_order_totals_its_lines() from public, anon, authenticated;
revoke all on function public.a_ticket_totals_its_lines() from public, anon, authenticated;

-- 2 ── The boarding code's episode discriminator is two hex characters.
--
-- mint_boarding_code builds UN-<4 letters of the slug>-<MMDD>-<last 4 of the
-- member number>-<2 hex of the episode id>. The first three parts are shared
-- by any two episodes whose slugs begin with the same four letters and which
-- sail on the same day, for the same member — so the whole of the difference
-- between them rests on those two characters. That is 256 values, and the
-- birthday arithmetic on 256 is unforgiving:
--
--     4 episodes   2.3%      10 episodes  16.3%
--     6 episodes   5.7%      12 episodes  23.0%
--     8 episodes  10.5%      14 episodes  30.4%
--
-- ...chance that two of them mint the same code. rsvps_boarding_code_once then
-- refuses the second booking, and the member is told a duplicate key violates
-- a unique constraint. It is not hypothetical: a suite run raises a dozen
-- episodes from one prefix on one date and hit it.
--
-- The migration that added this discriminator is called "two sailings cannot
-- mint the same boarding code" — the idea was right and the entropy was short.
-- Four characters is 65,536, which takes fourteen episodes from 30.4% to 0.1%,
-- and costs a member two more characters on a code they read off their card.
-- A code already minted keeps its shape: mint runs on insert only, and
-- boarding_code_key normalises the prefix and the case and asks nothing about
-- the length.
create or replace function public.mint_boarding_code(p_episode uuid, p_member_no text)
returns text
language plpgsql
stable
set search_path to 'public'
as $fn$
declare v record;
begin
  select slug, starts_at, time_zone into v from public.episodes where id = p_episode;
  return 'UN-' || upper(left(regexp_replace(v.slug, '[^a-zA-Z]', '', 'g'), 4))
      || '-' || to_char(v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'), 'MMDD')
      || '-' || right(coalesce(p_member_no, '0000'), 4)
      || '-' || upper(substr(md5(p_episode::text), 1, 4));
end $fn$;

comment on function public.mint_boarding_code(uuid, text) is
  'The code a member reads at the gangway. Four hex characters of the episode id, not two: everything before them is shared by two episodes that start alike on one day, and at two characters a dozen of them collided one run in four.';;
