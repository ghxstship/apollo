/* Two arithmetic holes in voyage operations, one migration.

   1. setVoyageStatus wrote the status column raw: cancelled -> scheduled and
      completed -> live were accepted, and only the per-branch old.status tests
      in handle_voyage_status limited the damage. The lifecycle is now a stated
      machine: same-status writes pass (idempotent operator clicks), terminal
      states are terminal, and every other move must be on the map.

   2. held_passes had no relation to berths_total. Lowering berths under the
      holds made capacity-for-sale negative and the manifest read permanently
      full with no operator-visible cause. Repair first (clamp), then assert
      (CHECK), the same order every repair in this corpus uses. */

update public.voyages set held_passes = least(held_passes, berths_total)
 where held_passes > berths_total;

alter table public.voyages
  add constraint holds_fit_the_hull check (held_passes >= 0 and held_passes <= berths_total);

create or replace function public.voyage_status_is_a_course()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'completed' or old.status = 'cancelled' then
    raise exception 'a sailing in the log stays in the log — % does not become %', old.status, new.status;
  end if;
  if not (
    (old.status = 'scheduled'    and new.status in ('live','weather_hold','completed','cancelled')) or
    (old.status = 'weather_hold' and new.status in ('scheduled','live','completed','cancelled')) or
    (old.status = 'live'         and new.status in ('weather_hold','completed','cancelled'))
  ) then
    raise exception 'a sailing does not go from % to % — hold it, complete it, or cancel it', old.status, new.status;
  end if;
  return new;
end $fn$;

drop trigger if exists voyage_status_is_a_course on public.voyages;
create trigger voyage_status_is_a_course
  before update of status on public.voyages
  for each row execute function public.voyage_status_is_a_course();;
