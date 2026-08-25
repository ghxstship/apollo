-- rotate_calendar_token checked `found` after a set_config() call, and
-- set_config is a SELECT that always returns a row — so `found` was true
-- whatever the UPDATE did, and a rotation that matched no profile would have
-- returned a token nobody stored. The member would have been shown a new
-- address for a feed still answering on the old one, which is the one lie this
-- control must never tell.
--
-- The row is read before it is written instead, on set_own_standing's shape,
-- so the refusal happens before any flag is set at all.
create or replace function public.rotate_calendar_token()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_now uuid;
  v_new uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception 'sign in required'; end if;

  select calendar_token into v_now from public.profiles where id = v_uid;
  if v_now is null then raise exception 'no such member'; end if;

  perform set_config('app.rotate_feed', 'on', true);
  update public.profiles set calendar_token = v_new where id = v_uid;
  perform set_config('app.rotate_feed', 'off', true);

  return v_new;
end;
$function$;;
