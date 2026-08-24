-- I carried `stable` over from the old body when I added the pacing, and the
-- pacing WRITES — Postgres refuses an INSERT in a non-volatile function at
-- runtime, not at definition time. So the function created cleanly and then
-- raised 0A000 on the first call. That call is the gangway's door check: every
-- sign-in on the site would have failed with "That didn't land."
--
-- Caught by calling it once before believing the migration. A definition that
-- applies is not a function that works.
create or replace function public.email_may_board(p_email text, p_fingerprint text default null)
returns boolean
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare who text; asked_here int; asked_about int; addr text;
begin
  addr := lower(btrim(coalesce(p_email, '')));
  if addr = '' then return false; end if;

  who := coalesce(
    nullif(btrim(coalesce(p_fingerprint, '')), ''),
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into asked_about
  from public.status_lookups
  where fingerprint = 'board:' || addr and looked_at > now() - interval '10 minutes';

  select count(*) into asked_here
  from public.status_lookups
  where fingerprint = 'board-from:' || who and looked_at > now() - interval '10 minutes';

  -- Ten tries at your own address in ten minutes is a person having a bad day.
  if asked_about >= 10 then
    raise exception 'that address has been tried a few times just now — give it a few minutes'
      using errcode = '53400';
  end if;
  -- Loose, because on the legitimate path this counts the web server.
  if asked_here >= 300 then
    raise exception 'too many tries from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('board:' || addr);
  insert into public.status_lookups (fingerprint) values ('board-from:' || who);

  return exists (select 1 from public.member_roll where lower(email) = addr)
      or exists (select 1 from public.profiles where lower(email) = addr);
end;
$function$;

revoke execute on function public.email_may_board(text, text) from public;
grant execute on function public.email_may_board(text, text) to anon, authenticated;
;
