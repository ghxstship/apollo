-- Nine findings of the RLS matrix and the Bridge CRUD tests.
--
-- 1. The gangway columns were guarded on UPDATE and on nothing else: a member
--    could INSERT a pass already checked in, with a boarding code of their
--    choosing and a hull assigned. The same three refusals the update guard
--    speaks, at the door the row comes in by.
create or replace function public.a_pass_arrives_unstamped()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('app.accepting_pass', true), 'off') = 'on' then return new; end if;
  if new.checked_in_at is not null or new.checked_in_by is not null then
    raise exception 'the gangway checks you in, not the other way round';
  end if;
  if new.boarding_code is not null then
    raise exception 'a boarding code is issued by the club';
  end if;
  if new.vessel_id is not null then
    raise exception 'the Bridge assigns hulls';
  end if;
  return new;
end $function$;
revoke all on function public.a_pass_arrives_unstamped() from public, anon, authenticated;
drop trigger if exists a_pass_arrives_unstamped on public.passes;
create trigger a_pass_arrives_unstamped
  before insert on public.passes
  for each row execute function public.a_pass_arrives_unstamped();

-- 2. The door's UPDATE policy on pass_guests admits every column, and the
--    column guard only refused the club's own (code, token, pass). A door
--    could rename a guest. A door stamps arrivals and nothing else, on a
--    guest as on a pass.
create or replace function public.guard_guest_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_staff() then return new; end if;

  if coalesce(current_setting('app.guest_signing', true), 'off') = 'on' then
    return new;
  end if;

  -- The pass went away and took the seat with it. That is the foreign key's
  -- doing, and detached_guest_returns_its_code handles what follows.
  if old.rsvp_id is not null and new.rsvp_id is null then
    return new;
  end if;

  /* Not the host: a door, by the policy that let the UPDATE through. */
  if auth.uid() is not null
     and not exists (select 1 from public.passes r where r.id = old.rsvp_id and r.profile_id = auth.uid()) then
    if (to_jsonb(new) - 'checked_in_at' - 'checked_in_by') is distinct from (to_jsonb(old) - 'checked_in_at' - 'checked_in_by') then
      raise exception 'the door stamps arrivals and nothing else';
    end if;
    return new;
  end if;

  if new.on_camera is distinct from old.on_camera then
    raise exception 'that is the guest''s to say, not yours';
  end if;

  if new.boarding_code is distinct from old.boarding_code
     or new.sign_token is distinct from old.sign_token
     or new.rsvp_id is distinct from old.rsvp_id then
    raise exception 'a guest pass is issued by the club';
  end if;

  return new;
end;
$function$;

-- 3. A wallet token names a member, not a night, and verify_wallet_token
--    asked is_door() with no episode — true for the holder of any live
--    grant. The door of one night could read the name and standing of a
--    member with no pass on it. A door now learns about a member only when
--    that member holds a pass on a night the door is granted; otherwise the
--    answer is 'elsewhere' and nothing else.
create or replace function public.verify_wallet_token(p_token uuid)
returns table(state text, profile_id uuid, full_name text, member_no text, standing text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  if not public.is_door() then raise exception 'staff only'; end if;
  select t.profile_id, t.revoked_at, p.full_name, p.member_no, p.status
    into v_row
  from public.wallet_tokens t
  join public.profiles p on p.id = t.profile_id
  where t.token = p_token;
  if v_row.profile_id is null or v_row.revoked_at is not null then
    return query select 'void'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;
  if not public.is_staff() and not exists (
    select 1 from public.passes r
    join public.door_grants g on g.episode_id = r.episode_id
    where r.profile_id = v_row.profile_id
      and r.status in ('aboard', 'waitlist')
      and g.profile_id = auth.uid()
      and g.expires_at > now()
  ) then
    return query select 'elsewhere'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;
  return query select
    case when v_row.status = 'active' then 'aboard' else 'hold' end,
    v_row.profile_id, v_row.full_name, v_row.member_no, v_row.status;
end;
$function$;

-- 4. A composed draft could not be struck: the cascade deletes the clauses
--    AFTER the version row, so the guard looked up a parent already gone, read
--    its status as null, and refused with the message for a PUBLISHED
--    document. A clause whose version is gone goes with it.
create or replace function public.guard_document_clauses()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  parent text;
begin
  select status into parent from public.document_versions
  where id = coalesce(new.document_version_id, old.document_version_id);
  if tg_op = 'DELETE' and parent is null then
    return old;
  end if;
  if parent is distinct from 'draft' then
    raise exception 'the clauses of a published document are fixed';
  end if;
  return coalesce(new, old);
end;
$function$;

-- 5. An element totalled itself once, on insert, and a change of quantity or
--    unit cost left the total as it was. Re-totalled whenever either moves,
--    unless the total itself was set by hand in the same write.
create or replace function public.total_an_element()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.total_cost_usd is null then
      new.total_cost_usd := new.qty * new.unit_cost_usd;
    end if;
  elsif (new.qty, new.unit_cost_usd) is distinct from (old.qty, old.unit_cost_usd)
        and new.total_cost_usd is not distinct from old.total_cost_usd then
    new.total_cost_usd := new.qty * new.unit_cost_usd;
  elsif new.total_cost_usd is null then
    new.total_cost_usd := new.qty * new.unit_cost_usd;
  end if;
  return new;
end $function$;

-- 6. Cities, hulls and tax determinations are reference tables and were not
--    on the record. record_the_change keyed a row on id/slug/key; city_tax
--    keys on city_id.
create or replace function public.record_the_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b jsonb; a jsonb; rid text;
begin
  if tg_op in ('UPDATE','DELETE') then b := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then a := to_jsonb(new); end if;
  rid := coalesce(a->>'id', b->>'id', a->>'slug', b->>'slug', a->>'key', b->>'key', a->>'city_id', b->>'city_id');
  if tg_op = 'UPDATE' and a = b then return new; end if;
  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (tg_table_name, rid, tg_op, auth.uid(), b, a);
  return coalesce(new, old);
end $function$;

drop trigger if exists zz_record_the_change on public.cities;
create trigger zz_record_the_change after insert or update or delete on public.cities
  for each row execute function public.record_the_change();
drop trigger if exists zz_record_the_change on public.vessels;
create trigger zz_record_the_change after insert or update or delete on public.vessels
  for each row execute function public.record_the_change();
drop trigger if exists zz_record_the_change on public.city_tax;
create trigger zz_record_the_change after insert or update or delete on public.city_tax
  for each row execute function public.record_the_change();

-- 7. A tax rate is basis points, nought to three thousand; 5000 and -1 both
--    landed.
alter table public.city_tax drop constraint if exists city_tax_rates_are_basis_points;
alter table public.city_tax add constraint city_tax_rates_are_basis_points
  check ((admissions_rate_bp is null or admissions_rate_bp between 0 and 3000)
     and (goods_rate_bp is null or goods_rate_bp between 0 and 3000));;
