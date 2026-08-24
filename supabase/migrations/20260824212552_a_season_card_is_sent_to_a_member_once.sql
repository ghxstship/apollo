-- Pressing the button twice mailed the whole club twice. There is no dedup on
-- (member, season) in this function and none in the action that calls it, and
-- production shows twelve to fourteen season cards per address.
--
-- This is not hypothetical harm: migration 20260823151338 records that a
-- season-card mass send is exactly what burned the daily Resend quota and left
-- seventy boarding passes stranded behind it. Boarding passes are the letters
-- that tell people where to stand.
--
-- One card per member per season label, enforced where the send happens rather
-- than in the button that triggers it, because the button is not the only way
-- in. The count returned now reflects what was actually queued, so an operator
-- pressing it a second time is told "0" instead of being told it worked again.
create or replace function public.send_season_cards(
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_season text default null::text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      -- Already told about this season, by any press of any button.
      and not exists (
        select 1 from public.email_outbox o
        where lower(o.to_email) = lower(p.email)
          and o.template = 'season-card'
          and o.payload->>'season' = label
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
$function$;
;
