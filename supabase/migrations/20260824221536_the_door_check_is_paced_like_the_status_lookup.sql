-- `email_may_board` answers true or false for ANY address, to anyone holding
-- the anon key, unlimited. Verified: true for a member address, false for a
-- non-member. That turns a deliberate product choice — the gangway says "No
-- pass under that email" rather than pretending to send — into a bulk
-- membership-enumeration tool. The club's whole shape is that membership is
-- private; a list of who is in it is the thing worth taking.
--
-- The UX stays. A person mistyping their own address should be told, and told
-- plainly, rather than left watching an inbox that will never fill. What goes
-- is the ability to ask ten thousand times.
--
-- Same two-bucket shape as application_status_for, and the same reasoning about
-- which bucket does the work: this is called from a SERVER ACTION, so
-- PostgREST sees the web server for every legitimate visitor and the per-caller
-- bound must stay loose or it becomes an outage. The per-address bound is the
-- tight one — an enumerator varies the address, which is the one thing they
-- cannot rotate away.
--
-- It is also the gate in front of a magic-link send, so pacing it bounds how
-- often one inbox can be made to receive one.
create or replace function public.email_may_board(p_email text, p_fingerprint text default null)
returns boolean
language plpgsql
stable security definer
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

-- The old one-argument form is dropped so nothing can keep calling the
-- unpaced version. A signature that still works is a signature that stays.
drop function if exists public.email_may_board(text);

revoke execute on function public.email_may_board(text, text) from public;
grant execute on function public.email_may_board(text, text) to anon, authenticated;
;
