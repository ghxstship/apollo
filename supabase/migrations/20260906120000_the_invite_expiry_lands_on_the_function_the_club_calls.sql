-- A correction to the invite work in 20260906040000.
--
-- That migration added the ninety-day expiry to apply_with_invite by writing a
-- FIVE-argument version of it. Five arguments is the signature that was retired
-- on 4 September, when a coded application started carrying the committee's
-- answers and the proposer who put the applicant forward. Writing it again did
-- not replace anything: it created a second function beside the live one, and
-- PostgREST cannot choose between two candidates with the same name.
--
-- So every anonymous call to the invite path answered PGRST203 instead of
-- doing its job — the whole public join-with-a-code route, which is the one
-- surface an applicant meets before they are anybody. Five of the suite's
-- checks caught it, and one of them is the door refusing a spent code, which
-- is the very thing the expiry was added to do.
--
-- The dead signature goes, and the expiry lands where the club actually calls.
drop function if exists public.apply_with_invite(text, text, text, text, text);

do $surgery$
declare
  src text;
  anchor text := 'where upper(code) = upper(btrim(coalesce(p_code, ''''))) and uses < max_uses';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.oid::regprocedure::text = 'apply_with_invite(text,text,text,text,text,jsonb,text)';
  if src is null then
    raise exception 'the seven-argument apply_with_invite is gone — look before patching';
  end if;
  if position(anchor in src) = 0 then
    raise exception 'apply_with_invite no longer tests the code the way this expects';
  end if;
  if position('expires_at' in src) > 0 then
    raise notice 'apply_with_invite already asks whether the code is still in date';
    return;
  end if;
  src := replace(src, anchor, anchor || ' and expires_at > now()');
  execute src;
end $surgery$;

comment on function public.apply_with_invite(text, text, text, text, text, jsonb, text) is
  'The coded application: the answers, the proposer, and a code that must still be unspent AND inside its ninety days. There is one signature; a second was written by mistake and PostgREST could choose neither.';

-- And the trigger function keeps Postgres's default PUBLIC EXECUTE unless it is
-- taken away. Same slip, same correction, third time in this wave.
revoke all on function public.guard_the_invite_allowance() from public, anon, authenticated;
