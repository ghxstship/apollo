-- The rate limit I put on the status page bucketed on
-- request.headers->>'x-forwarded-for'. But /apply-status calls this from a
-- SERVER action, so PostgREST sees the Next server for every visitor — one
-- shared budget of ten lookups per ten minutes for the entire site. The
-- eleventh applicant ANYWHERE would have been refused, and in production that
-- is a self-inflicted outage on the page whose whole promise is "no black box,
-- no silence… you can read yours any hour of the day".
--
-- A guard that stops legitimate use is not a guard, it is the same denial of
-- service the attacker wanted, arriving by our own hand.
--
-- Two buckets now, and a caller may name itself. The server action passes the
-- visitor's forwarded address; failing that we still bucket per EMAIL, which
-- is the thing being enumerated and cannot be spoofed away by rotating IPs.
-- The per-caller bucket is generous, the per-address one is tight: guessing
-- ten different addresses is enumeration, checking your own status ten times
-- is a nervous applicant.
create or replace function public.application_status_for(
  p_email text,
  p_fingerprint text default null
)
returns application_status
language plpgsql
security definer
set search_path to 'public'
as $$
declare who text; recent int; per_email int; result application_status;
begin
  who := coalesce(
    nullif(btrim(coalesce(p_fingerprint, '')), ''),
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into recent
  from public.status_lookups
  where fingerprint = who and looked_at > now() - interval '10 minutes';

  -- The address is the thing an enumerator varies, so it gets the tight bound.
  select count(*) into per_email
  from public.status_lookups
  where fingerprint = 'email:' || lower(btrim(p_email))
    and looked_at > now() - interval '10 minutes';

  if per_email >= 8 then
    raise exception 'that address has been checked a few times just now — give it a few minutes';
  end if;
  if recent >= 60 then
    raise exception 'too many lookups from here just now — give it a few minutes';
  end if;

  insert into public.status_lookups (fingerprint) values (who);
  insert into public.status_lookups (fingerprint) values ('email:' || lower(btrim(p_email)));

  select status into result from public.applications
  where lower(email) = lower(p_email)
  order by
    case status
      when 'aboard' then 4 when 'invited' then 3 when 'review' then 2 else 1
    end desc,
    created_at desc
  limit 1;

  return result;
end;
$$;

revoke execute on function public.application_status_for(text, text) from public;
grant execute on function public.application_status_for(text, text) to anon, authenticated;
drop function if exists public.application_status_for(text);;
