-- Binding the cap to the names was right; forcing `guests` to match them was
-- not. A member who set guests = 1 with no names had it silently rewritten to
-- zero instead of being told guest passes ride on Global — the e2e caught the
-- refusal turning into a shrug.
create or replace function public.guard_guest_names()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tier text; v_named int; v_asked int; v_want int;
begin
  v_named := coalesce(array_length(new.guest_names, 1), 0);
  v_asked := coalesce(new.guests, 0);
  v_want  := greatest(v_named, v_asked);

  if public.is_staff() then
    if v_named > 0 then new.guests := v_named; end if;
    return new;
  end if;

  if v_want > 0 then
    select tier::text into v_tier from public.profiles where id = new.profile_id;
    if v_tier is distinct from 'global' then
      raise exception 'guest passes ride on Global memberships';
    end if;
  end if;
  if v_want > 2 then raise exception 'two guest passes per member'; end if;
  if v_named > 0 then new.guests := v_named; end if;
  return new;
end;
$$;

revoke execute on function public.guard_guest_names() from public, anon, authenticated;

drop trigger if exists guard_guest_names on public.rsvps;
create trigger guard_guest_names
  before insert or update of guest_names, guests on public.rsvps
  for each row execute function public.guard_guest_names();
