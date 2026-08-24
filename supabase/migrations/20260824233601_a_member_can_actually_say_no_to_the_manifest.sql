-- `voyage_manifest` shows every member aboard a sailing to every other member,
-- and the migration that introduced it is explicit about why: "Consent is the
-- gate here, not ownership; show_on_manifest is the member saying yes."
--
-- The gate does not exist. `rsvps.show_on_manifest` defaults to TRUE, nothing
-- in the product ever writes it — `grep -rn show_on_manifest src/` finds only a
-- type and a comment — and the rsvps UPDATE policy carries `is_active()` in its
-- WITH CHECK, so a member the club has placed on hold cannot change it even
-- through the API. The member most likely to want off a list was the one
-- blocked from leaving it. So every member is on every manifest, visible to the
-- whole club, having never been asked.
--
-- Three changes, so the sentence in that comment becomes true:
--
--   A PLACE TO SAY IT ONCE. profiles.on_manifest, a standing answer rather than
--   a per-booking one, because "do not list me" is a thing about a person, not
--   about a Tuesday. show_on_manifest survives as the per-sailing override.
--
--   A WAY TO SAY IT WHILE HELD. A definer setter any signed-in member may call
--   whatever their standing. A privacy control that switches off when the club
--   holds your membership is not a privacy control.
--
--   AND THE DEPARTED COME OFF. A member who has left the club stayed on every
--   manifest they ever sailed, readable by the whole club, forever — while
--   /legal promises departure "erases your profile within 30 days". The erasure
--   itself is a separate and larger problem; this is the read that leaks
--   meanwhile.
alter table public.profiles
  add column if not exists on_manifest boolean not null default true;

comment on column public.profiles.on_manifest is
  'The member''s standing answer to being listed on the manifests of sailings they are aboard. Settable while on hold, deliberately.';

create or replace function public.set_manifest_visibility(p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  -- Deliberately NOT gated on is_active(). A held membership is exactly when
  -- somebody is most likely to want their name off a list.
  update public.profiles set on_manifest = coalesce(p_on, true) where id = auth.uid();
end $$;

revoke execute on function public.set_manifest_visibility(boolean) from public, anon;
grant execute on function public.set_manifest_visibility(boolean) to authenticated;

create or replace function public.voyage_manifest(p_voyage uuid)
returns table(full_name text, avatar_tone text, guests integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  return query
    select coalesce(p.full_name, 'A member'), p.avatar_tone, coalesce(r.guests, 0)
    from public.rsvps r
    join public.profiles p on p.id = r.profile_id
    where r.voyage_id = p_voyage
      and r.status = 'aboard'
      and r.show_on_manifest
      and p.on_manifest
      and p.status <> 'departed'
    order by p.full_name;
end;
$function$;

-- contest_standing handed over full_name AND handle for every entrant with no
-- regard for the directory opt-out that member_directory enforces one call
-- away: the view withholds the handle, the RPC gave it out. Same person, same
-- viewer, two answers. A leaderboard is a public-facing thing inside the club,
-- so an unlisted member appears in it without being named.
create or replace function public.contest_standing(p_contest_id uuid)
returns table(profile_id uuid, full_name text, handle text, score numeric, place integer, met boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  c public.contests;
  me uuid := auth.uid();
  staff boolean;
begin
  if me is null then raise exception 'sign in required'; end if;
  staff := public.is_staff();

  select * into c from public.contests where id = p_contest_id;
  if not found then raise exception 'no such contest'; end if;
  if c.status = 'draft' and not staff then raise exception 'not open'; end if;

  if c.status = 'settled' then
    return query
      select r.profile_id,
             case when staff or r.profile_id = me or p.in_directory
                  then p.full_name else 'A member' end,
             case when staff or r.profile_id = me or p.in_directory
                  then p.handle else null end,
             r.score, r.place, r.met
      from public.contest_results r
      join public.profiles p on p.id = r.profile_id
      where r.contest_id = c.id
      order by r.place nulls last, r.score desc;
    return;
  end if;

  return query
  with entrant as (
    select e.profile_id from public.contest_entries e where e.contest_id = c.id
  ),
  sail as (
    select r.profile_id, v.id as voyage_id, v.harbor_id, v.distance_nm, r.vessel_id
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard'
      and v.status = 'completed'
      and v.starts_at >= c.starts_at
      and v.starts_at < c.ends_at
      and (c.voyage_id is null or v.id = c.voyage_id)
      and r.profile_id in (select e.profile_id from entrant e)
  ),
  scored as (
    select
      en.profile_id,
      case c.metric
        when 'nm'       then (select coalesce(sum(s.distance_nm), 0) from sail s where s.profile_id = en.profile_id)
        when 'sailings' then (select count(*) from sail s where s.profile_id = en.profile_id)
        when 'harbors'  then (select count(distinct s.harbor_id) from sail s
                               where s.profile_id = en.profile_id and s.harbor_id is not null)
        when 'vessels'  then (select count(distinct s.vessel_id) from sail s
                               where s.profile_id = en.profile_id and s.vessel_id is not null)
        when 'crew_met' then (select count(distinct r2.profile_id) from public.rsvps r2
                               where r2.voyage_id in (select s.voyage_id from sail s where s.profile_id = en.profile_id)
                                 and r2.status = 'aboard'
                                 and r2.profile_id <> en.profile_id)
        when 'frames'   then (select count(*) from public.voyage_media m
                               where m.uploaded_by = en.profile_id
                                 and m.approved
                                 and m.created_at >= c.starts_at
                                 and m.created_at < c.ends_at)
        else 0
      end::numeric as score
    from entrant en
  )
  select
    sc.profile_id,
    case when staff or sc.profile_id = me or p.in_directory
         then p.full_name else 'A member' end,
    case when staff or sc.profile_id = me or p.in_directory
         then p.handle else null end,
    sc.score,
    -- A challenge has no places; everyone who reaches the target has won it.
    case when c.shape = 'regatta'
      then rank() over (order by sc.score desc)::integer
      else null
    end as place,
    case when c.target is null then false else sc.score >= c.target end as met
  from scored sc
  join public.profiles p on p.id = sc.profile_id
  order by sc.score desc, p.full_name;
end;
$function$;
;
