-- The guest guard refused every tier but 'global', which under Model C is
-- Founding alone, while the FAQ promised two guests on "Global passes" and
-- Founding's own copy promised "a guest". A Cabin member seating a guest hit
-- an exception. The allowance is a number on the plan now — two on every paid
-- tier today, the figure the FAQ already quoted — and the guard, the FAQ and
-- the Plans console all read the same column.
create or replace function public.guard_guest_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid; v_allow int; v_seated int; v_base text; v_slot int; v_taken boolean;
begin
  if public.is_staff() then return new; end if;

  select r.profile_id, coalesce(m.guest_allowance, 0), r.boarding_code
    into v_owner, v_allow, v_base
  from public.passes r
  join public.profiles p on p.id = r.profile_id
  left join public.membership_plans m on m.id = p.plan_id
  where r.id = new.rsvp_id;

  if v_owner is null then raise exception 'no such pass'; end if;
  if v_owner <> auth.uid() then raise exception 'that pass is not yours'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;

  if new.kind = 'partner' then
    if not exists (select 1 from public.passes r where r.id = new.rsvp_id and r.segment = 'couple') then
      raise exception 'a partner rides a couple pass — this pass seats one';
    end if;
  else
    if v_allow <= 0 then
      raise exception 'guest passes ride on paid memberships — Deck and above';
    end if;
    select count(*) into v_seated from public.pass_guests g where g.rsvp_id = new.rsvp_id and g.kind = 'guest';
    if v_seated >= v_allow then
      raise exception '% guest % per pass on your plan', v_allow, case when v_allow = 1 then 'pass' else 'passes' end;
    end if;
  end if;

  v_base := coalesce(v_base, 'UN-' || upper(left(replace(new.rsvp_id::text, '-', ''), 8)));
  new.boarding_code := null;
  for v_slot in 1..24 loop
    select exists (
      select 1 from public.pass_guests g where g.boarding_code = v_base || '-G' || v_slot::text
    ) into v_taken;
    if not v_taken then
      new.boarding_code := v_base || '-G' || v_slot::text;
      exit;
    end if;
  end loop;
  if new.boarding_code is null then raise exception 'no free guest code left on this pass'; end if;

  new.seated_by := auth.uid();
  new.sign_token := gen_random_uuid();
  new.checked_in_at := null;
  new.checked_in_by := null;
  new.on_camera := false;
  return new;
end;
$function$;;
