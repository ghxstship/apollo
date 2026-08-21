-- Two loose ends from the logbook work.
--
-- 1. season_card() and its email template both existed and nothing ever called
--    them. A season's card that never sends is a function, not a feature.
-- 2. contests.scope = 'crew' was modelled and constrained and no surface ever
--    created one. Dead schema is worse than no schema, because it reads as a
--    capability. The Bridge can now scope a contest to a single sailing.

-- ===== The season's card =====================================================

/* Queues one card per member who actually sailed in the window. Members who did
   not sail get nothing — a card reading "you sailed 0 miles" is a reproach, not
   a keepsake, and the club does not send those. */
create or replace function public.send_season_cards(
  p_from timestamptz,
  p_to   timestamptz,
  p_season text default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m      record;
  queued integer := 0;
  label  text := coalesce(p_season, to_char(p_from, 'Mon YYYY') || ' — ' || to_char(p_to, 'Mon YYYY'));
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_to <= p_from then raise exception 'a season runs forwards'; end if;

  for m in
    select p.id, p.full_name, p.email
    from public.profiles p
    where p.email is not null
      and p.status = 'active'
      and exists (
        select 1 from public.rsvps r
        join public.voyages v on v.id = r.voyage_id
        where r.profile_id = p.id and r.status = 'aboard' and v.status = 'completed'
          and v.starts_at >= p_from and v.starts_at < p_to
      )
  loop
    insert into public.email_outbox (to_email, template, payload)
    select
      m.email, 'season-card',
      jsonb_build_object(
        'name', m.full_name,
        'season', label,
        'sailings', c.sailings,
        'nm_logged', c.nm_logged,
        'harbors', c.harbors,
        'crew_met', c.crew_met,
        'knots_earned', c.knots_earned,
        'marks', to_jsonb(c.marks_won),
        'longest_nm', c.longest_nm,
        'longest_title', c.longest_title
      )
    from public.season_card(m.id, p_from, p_to) c;
    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke execute on function public.send_season_cards(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.send_season_cards(timestamptz, timestamptz, text) to authenticated;

comment on function public.send_season_cards(timestamptz, timestamptz, text) is
  'Queues the season card for everyone who sailed in the window. Called from the Bridge at season close, not on a timer — a season ends when the club says it does.';

-- season_card() is staff-or-self; send_season_cards runs it for other members,
-- so it needs to be callable from inside a definer function owned by postgres.
-- It already is: both are definer, and the inner call runs as the owner.

-- ===== Crew-scoped contests ==================================================

-- The constraint already required a voyage for a crew-scoped contest. What was
-- missing is the standing that says who may enter one: the crew of that sailing,
-- and nobody else.
drop policy if exists "enter yourself" on public.contest_entries;
create policy "enter yourself" on public.contest_entries
  for insert to authenticated with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.contests c
      where c.id = contest_id
        and c.status = 'open'
        and now() < c.ends_at
        and (
          c.scope = 'member'
          or exists (
            select 1 from public.rsvps r
            where r.voyage_id = c.voyage_id
              and r.profile_id = auth.uid()
              and r.status = 'aboard'
          )
        )
    )
  );

comment on column public.contests.scope is
  'member = open to the club; crew = open only to those aboard contests.voyage_id.';
