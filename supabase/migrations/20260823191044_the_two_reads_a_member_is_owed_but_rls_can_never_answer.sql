-- Two screens asked a question RLS structurally cannot answer, got an empty
-- result, and rendered it as "nothing here" instead of "I am not allowed to
-- know". Both are features that have never once worked.
--
-- 1. The transfer inbox. To show "Priya offered you her pass on the Gulf
--    Stream Run", the page must read PRIYA's rsvp — and rsvps is
--    `profile_id = auth.uid() OR is_staff()`. So voyageById was always empty,
--    inbound always [], and no member could ever see, accept or decline an
--    offer through the UI. pass_transfers itself is readable by both parties,
--    so the offer existed and was simply never drawn.
create or replace function public.incoming_transfers()
returns table (
  transfer_id uuid,
  from_name   text,
  voyage_id   uuid,
  title       text,
  starts_at   timestamptz,
  time_zone   text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  return query
    select t.id,
           coalesce(p.full_name, 'A member'),
           v.id,
           v.title,
           v.starts_at,
           v.time_zone
    from public.pass_transfers t
    join public.rsvps r   on r.id = t.rsvp_id
    join public.voyages v on v.id = r.voyage_id
    left join public.profiles p on p.id = t.from_profile
    where t.to_profile = auth.uid()
      and t.status = 'offered';
end;
$$;

revoke execute on function public.incoming_transfers() from public, anon;
grant execute on function public.incoming_transfers() to authenticated;

-- 2. The charter roster. "Real names ride with consent, and only for
--    signed-in members" — but a member can only read their own rsvp, so the
--    list was empty for everyone except staff, and guestCount was always 0.
--    Consent is the gate here, not ownership: show_on_manifest is the member
--    saying yes.
create or replace function public.voyage_manifest(p_voyage uuid)
returns table (full_name text, avatar_tone text, guests int)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
    order by p.full_name;
end;
$$;

revoke execute on function public.voyage_manifest(uuid) from public, anon;
grant execute on function public.voyage_manifest(uuid) to authenticated;

-- 3. The same shape one screen over: /manifest marks a cabin taken by reading
--    other members' rsvps by cabin_id, so every cabin renders free. No claim
--    exists in the data yet, so this is the mechanism fixed before it shows.
create or replace function public.claimed_cabins(p_cabins uuid[])
returns table (cabin_id uuid, voyage_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  return query
    select r.cabin_id, r.voyage_id
    from public.rsvps r
    where r.cabin_id = any(p_cabins)
      and r.status = 'aboard';
end;
$$;

revoke execute on function public.claimed_cabins(uuid[]) from public, anon;
grant execute on function public.claimed_cabins(uuid[]) to authenticated;;
