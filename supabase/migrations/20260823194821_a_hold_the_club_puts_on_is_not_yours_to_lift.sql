-- is_active() is the gate on every spend path in this codebase, and the Bridge's
-- only hold writes profiles.status = 'paused'. set_own_standing knew that
-- coming back from 'departed' needs Shoreside — and let a member lift a
-- 'paused' in one call, whoever put it there. A hold for unpaid dues or for
-- conduct was self-service to remove.
--
-- Pausing yourself is still yours to undo. The difference is who set it, so
-- the row has to remember.
alter table public.profiles
  add column if not exists status_set_by uuid references public.profiles(id),
  add column if not exists status_set_at timestamptz;

-- Existing holds are treated as self-imposed. Backfilling them as the club's
-- would silently strand anyone who paused themselves before today; only holds
-- set from here on carry the club's name.
update public.profiles
   set status_set_by = id, status_set_at = coalesce(status_set_at, now())
 where status_set_by is null;

create or replace function public.stamp_who_changed_standing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status then
    -- auth.uid() is null under cron and the service role: a hold nobody signed
    -- for is the club's, not the member's.
    new.status_set_by := auth.uid();
    new.status_set_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.stamp_who_changed_standing() from public, anon, authenticated;

drop trigger if exists stamp_who_changed_standing on public.profiles;
create trigger stamp_who_changed_standing
  before update of status on public.profiles
  for each row execute function public.stamp_who_changed_standing();

create or replace function public.set_own_standing(p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now text;
  v_by  uuid;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if p_status not in ('active', 'paused', 'departed') then
    raise exception 'that is not a standing';
  end if;

  select status, status_set_by into v_now, v_by from public.profiles where id = v_uid;
  if v_now is null then raise exception 'no such member'; end if;
  if v_now = p_status then return; end if;

  -- Leaving is yours to do; coming back from it is a word with Shoreside.
  if v_now = 'departed' then
    raise exception 'your place is closed — a word with Shoreside opens it again';
  end if;

  -- So is coming back from a hold you did not put on yourself.
  if v_now = 'paused' and p_status = 'active' and v_by is distinct from v_uid then
    raise exception 'that hold was placed by the club — a word with Shoreside lifts it';
  end if;

  perform set_config('app.set_standing', 'on', true);
  update public.profiles set status = p_status where id = v_uid;
  perform set_config('app.set_standing', 'off', true);
end;
$$;

revoke execute on function public.set_own_standing(text) from public, anon;
grant execute on function public.set_own_standing(text) to authenticated;;
