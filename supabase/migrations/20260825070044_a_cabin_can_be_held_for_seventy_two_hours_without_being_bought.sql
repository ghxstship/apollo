/* OPTION — the one charter state apollo has no equivalent for.

   The kit's four states are CONFIRMED (cabin held, balance paid), OPTION (held
   72 hours, no charge), WAITLIST (in order, 6-hour claim) and CLOSED (season
   sailed). Three of those already exist: rsvp_status carries aboard and
   waitlist, and CLOSED is voyage_status = 'completed'. OPTION is genuinely new,
   and the nearest precedent in the schema is table_seats.held_until at fifteen
   minutes.

   It is deliberately NOT a new value on rsvp_status. Eight triggers switch on
   that enum — the knots award, the welcome letter, the boarding code, the
   capacity count — and every one of them would have to learn that this new
   value is not a booking. A member holding an option has not bought anything,
   has not been counted aboard, and must not receive the letter that says they
   have. A separate table means none of those triggers change and none of them
   can be wrong about it.

   The hold is on a CABIN, which is what the kit's OPTION copy says ("Cabin
   held"), and it is the grain apollo already counts under a lock. */
create table public.charter_options (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  cabin_id uuid not null references public.cabins(id) on delete cascade,
  taken_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  confirmed_at timestamptz,
  constraint an_option_expires_after_it_is_taken check (expires_at > taken_at),
  /* An option ends once, one way. Both stamped means two different stories
     about the same hold, and the surface would render whichever it read first. */
  constraint an_option_is_released_or_confirmed_never_both
    check (released_at is null or confirmed_at is null)
);

/* One live option per member per passage. Partial, so the row survives its own
   expiry as a record and the member can take another. */
create unique index one_live_option_per_member_per_passage
  on public.charter_options (voyage_id, profile_id)
  where released_at is null and confirmed_at is null;

/* The count the guard runs. An index rather than a comment because it is read
   inside an advisory lock on every hold and every boarding. */
create index charter_options_live_by_cabin
  on public.charter_options (voyage_id, cabin_id)
  where released_at is null and confirmed_at is null;

alter table public.charter_options enable row level security;

/* Your own holds, and the crew's. Nothing is writable through the API at all:
   the expiry clock and the capacity count are the whole rule, and a member who
   could INSERT could set expires_at to next year. Both writes go through the
   definers below. */
create policy "your own options or staff" on public.charter_options
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy "staff clear options" on public.charter_options
  for delete to authenticated using (public.is_staff());

revoke insert, update, delete on public.charter_options from anon;
revoke insert, update on public.charter_options from authenticated;

/* Take a cabin on option.

   Lazy expiry inside the lock, in the shape claim_table_seat already uses:
   sweeping stale holds here rather than on a schedule means the rule is correct
   even when the scheduler is not running. A cron that is down turns a 72-hour
   hold into a permanent one, and nobody notices until the passage sails empty
   with every cabin "held". */
create or replace function public.hold_a_cabin_on_option(p_voyage uuid, p_cabin uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_cabin record;
  v_taken integer;
  v_until timestamptz;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if not public.is_active() then
    raise exception 'your membership is paused';
  end if;

  /* The same lock key guard_cabin_capacity() takes, so a hold and a boarding
     cannot both read the last place as free. A different key here would make
     both counts correct and the pair of them wrong. */
  perform pg_advisory_xact_lock(hashtext('cabin:' || p_cabin::text || ':' || p_voyage::text));

  select c.id, c.berths, c.name into v_cabin
  from public.cabins c where c.id = p_cabin and c.active;
  if v_cabin.id is null then raise exception 'no such cabin'; end if;

  /* Anything past its 72 hours stops holding a place the moment someone asks
     for that place. */
  update public.charter_options
     set released_at = expires_at
   where voyage_id = p_voyage
     and released_at is null and confirmed_at is null
     and expires_at <= now();

  select id into v_existing from public.charter_options
   where voyage_id = p_voyage and profile_id = v_uid
     and released_at is null and confirmed_at is null;
  if v_existing is not null then
    raise exception 'you already hold a cabin on this passage — release it before taking another';
  end if;

  select count(*) into v_taken from (
    select 1 from public.rsvps r
     where r.voyage_id = p_voyage and r.cabin_id = p_cabin and r.status = 'aboard'
    union all
    select 1 from public.charter_options o
     where o.voyage_id = p_voyage and o.cabin_id = p_cabin
       and o.released_at is null and o.confirmed_at is null
  ) held;

  if v_taken >= v_cabin.berths then
    raise exception 'that cabin is spoken for — % places, all claimed or held', v_cabin.berths;
  end if;

  v_until := now() + interval '72 hours';
  insert into public.charter_options (voyage_id, profile_id, cabin_id, expires_at)
  values (p_voyage, v_uid, p_cabin, v_until);
  return v_until;
end;
$$;

/* Let it go early. Releasing is the member's own act and needs no lock — the
   row is theirs and the count only ever gets smaller. */
create or replace function public.release_charter_option(p_option uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_done timestamptz;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select profile_id, coalesce(released_at, confirmed_at) into v_owner, v_done
  from public.charter_options where id = p_option;
  if v_owner is null then raise exception 'no such hold'; end if;
  if v_owner <> v_uid and not public.is_staff() then
    raise exception 'that hold is not yours';
  end if;
  if v_done is not null then return; end if;
  update public.charter_options set released_at = now() where id = p_option;
end;
$$;

/* What a member may see of their own passage's cabin plan without being able to
   read anyone else's hold: how many places are free, cabin by cabin. Counting
   through a definer rather than exposing charter_options is the difference
   between "Cabin 06 has one place left" and "Mara is thinking about Cabin 06". */
create or replace function public.cabin_places_open(p_voyage uuid)
returns table (cabin_id uuid, name text, berths integer, taken integer, mine boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return query
    select c.id, c.name, c.berths,
           (select count(*)::integer from (
              select 1 from public.rsvps r
               where r.voyage_id = p_voyage and r.cabin_id = c.id and r.status = 'aboard'
              union all
              select 1 from public.charter_options o
               where o.voyage_id = p_voyage and o.cabin_id = c.id
                 and o.released_at is null and o.confirmed_at is null
                 and o.expires_at > now()
            ) held),
           exists (
             select 1 from public.charter_options o
              where o.voyage_id = p_voyage and o.cabin_id = c.id
                and o.profile_id = auth.uid()
                and o.released_at is null and o.confirmed_at is null
                and o.expires_at > now()
           )
    from public.cabins c
    join public.voyage_vessels vv on vv.vessel_id = c.vessel_id
   where vv.voyage_id = p_voyage and c.active
   order by c.position, c.name;
end;
$$;

revoke all on function public.hold_a_cabin_on_option(uuid, uuid) from public;
revoke all on function public.release_charter_option(uuid) from public;
revoke all on function public.cabin_places_open(uuid) from public;
grant execute on function public.hold_a_cabin_on_option(uuid, uuid) to authenticated;
grant execute on function public.release_charter_option(uuid) to authenticated;
grant execute on function public.cabin_places_open(uuid) to authenticated;
;
