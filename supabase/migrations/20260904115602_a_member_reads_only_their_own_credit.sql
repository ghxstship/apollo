-- pass_credit_left(p_profile_id) answered for whichever profile it was handed.
-- It is granted to every signed-in member, so any member could read any
-- other's remaining allowance. Your own, or the Bridge's to ask.
create or replace function public.pass_credit_left(p_profile_id uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select greatest(0, c.granted_cents - c.spent_cents)
       from public.pass_credits c
      where c.profile_id = coalesce(p_profile_id, auth.uid())
        and (c.profile_id = auth.uid() or public.is_staff())
        and c.period = date_trunc('month', (now() at time zone 'America/New_York'))::date),
    0);
$function$;

revoke all on function public.pass_credit_left(uuid) from public, anon;
grant execute on function public.pass_credit_left(uuid) to authenticated;;
