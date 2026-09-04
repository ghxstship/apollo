-- guard_guest_names fired before pass_guard and still refused passes.guests on
-- any tier but 'global' with a literal cap of two — the same rename residue,
-- masking the plan-allowance rule on Deck, Cabin and Owner. It reads the plan.
create or replace function public.guard_guest_names()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_allow int; v_named int; v_asked int; v_want int;
begin
  v_named := coalesce(array_length(new.guest_names, 1), 0);
  v_asked := coalesce(new.guests, 0);
  v_want  := greatest(v_named, v_asked);

  if public.is_staff() then
    if v_named > 0 then new.guests := v_named; end if;
    return new;
  end if;

  if v_want > 0 then
    select coalesce(m.guest_allowance, 0) into v_allow
      from public.profiles p left join public.membership_plans m on m.id = p.plan_id
     where p.id = new.profile_id;
    if coalesce(v_allow, 0) <= 0 then
      raise exception 'guest passes ride on paid memberships — Deck and above';
    end if;
    if v_want > v_allow then
      raise exception '% guest passes per pass on your plan', v_allow;
    end if;
  end if;

  if v_named > 0 then new.guests := v_named; end if;
  return new;
end;
$function$;;
