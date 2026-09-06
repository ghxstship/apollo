-- club_setting() handed every dial the club has to anybody who asked.
--
-- It is granted to anon on purpose and the suite asserts that outright —
-- "club_setting() · anon (open — integers only)" — because three figures on it
-- genuinely are public: the hull ceiling, the knots a pass awards, and whether
-- the keys console is open. A public page states them, and stating them once
-- from one place is the point of the dials table.
--
-- What changed is not the grant, it is the CONTENTS. The table held eleven
-- dials when that decision was made and it holds forty-two now, and today
-- alone it gained the failure-alarm thresholds, the pacing window, the session
-- staleness and the quiet hours. So an anonymous caller could read
-- alarm_app_errors and learn exactly how many failures they may cause before
-- anybody is woken, and alarm_window_minutes to learn how long to wait between
-- them. That is a small disclosure and a real one, and it arrived by
-- accretion: nobody decided it, the table simply grew underneath a grant that
-- was written when it was small.
--
-- The fix is not to close the grant — a page that shows the hull ceiling would
-- then need a service role to read a number the club prints on a poster. It is
-- to make "public reading" a property of the DIAL rather than of the whole
-- table, so adding a dial is no longer implicitly a decision to publish it.
-- The default is closed, which means every dial added from here is private
-- until somebody says otherwise, in a column the Bridge can see.
--
-- Anon gets NULL rather than an error, which is the same reading the sealed
-- views take: a caller with no business knowing a figure is told nothing, not
-- told that there is something they are not being told.

alter table public.club_settings
  add column if not exists is_public boolean not null default false;

comment on column public.club_settings.is_public is
  'Whether an anonymous caller may read this dial. False by default, so a dial added next year is private until somebody decides otherwise — the previous arrangement was the reverse, and the table quietly published every figure added to it.';

/* The three the suite asserts and a public page states, plus the age a guest
   is entitled to know before they are asked to attest to it. */
update public.club_settings set is_public = true
 where key in ('hull_ceiling_heads', 'knots_pass_award', 'keys_console_enabled', 'guest_minimum_age');

create or replace function public.club_setting(p_key text)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v_row record;
begin
  select value_int, is_public into v_row from public.club_settings where key = p_key;
  if v_row is null then return null; end if;

  /* Only an explicitly anonymous caller is held. auth.role() is 'anon' for a
     visitor, 'authenticated' for a member, 'service_role' for the edge
     functions and the drains — and NULL in a plain SQL session such as cron,
     which must keep reading everything. Written as "block anon" rather than
     "allow the rest" so a context nobody anticipated fails open to the club's
     own machinery instead of silently breaking a scheduled job. */
  if coalesce(auth.role(), 'service_role') = 'anon' and not v_row.is_public then
    return null;
  end if;
  return v_row.value_int;
end $fn$;

revoke all on function public.club_setting(text) from public;
grant execute on function public.club_setting(text) to anon, authenticated, service_role;

comment on function public.club_setting(text) is
  'An integer dial, or NULL. Public reading is a property of the dial: an anonymous caller gets the value only where club_settings.is_public says so, and NULL otherwise — not an error, which would tell them there is something they are not being told. Members, staff, the service role and plain SQL sessions read everything.';

create or replace function public.club_setting_text(p_key text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v_row record;
begin
  select nullif(btrim(coalesce(value_text, '')), '') as value_text, is_public
    into v_row from public.club_settings where key = p_key;
  if v_row is null then return null; end if;
  if coalesce(auth.role(), 'service_role') = 'anon' and not v_row.is_public then
    return null;
  end if;
  return v_row.value_text;
end $fn$;

revoke all on function public.club_setting_text(text) from public;
grant execute on function public.club_setting_text(text) to anon, authenticated, service_role;

comment on function public.club_setting_text(text) is
  'The text side of a dial, held to the same public-reading rule as the integer side. NULL where the row is missing, empty, or not this caller''s to read. No text dial is public today: the postal address reaches people on the letters that carry it, and the rest — a deadline, a version, a project reference — are the club''s own business.';

notify pgrst, 'reload schema';
