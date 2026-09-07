-- 125 SECURITY DEFINER functions are callable by a member or a stranger, and
-- until today nobody had read them as a set.
--
-- A definer function runs as its owner, so it sees past every policy in the
-- database. That is the point — it is how a sealed view answers, how a code is
-- spent, how a pacing gate counts. It is also the largest attack surface here,
-- because each one's lock is written in its own body rather than in a policy
-- somebody can read from outside.
--
-- Reading all 125 found two things. A consent text that promised a narrower
-- disclosure than episode_manifest() actually makes, corrected in
-- 20260907120000. And quiet_until(), granted to authenticated out of habit,
-- which let any member read any other member's timezone and chosen quiet
-- window; nothing called it that way and the grant is gone.
--
-- This is so the reading does not have to happen again from scratch, and so
-- the next definer function added has to say which kind it is.
--
-- WHY HERE AND NOT IN A GATE SCRIPT. The first attempt was a script reading
-- the migration corpus, and it was wrong in the direction that matters: the
-- corpus is a pile of text where one function's body runs into the next, and
-- the parser credited four functions with a check that belonged to the
-- statement below them. A function that does NOT check its caller reading as
-- though it does is precisely the failure such a gate exists to prevent.
--
-- The database knows the answer exactly. security_report() is already the
-- club's place for questions like this, the suite already asserts that none of
-- its rows fail, and pg_get_functiondef needs no parser.
--
-- THE RULE. A definer function reachable by anon or authenticated must either
-- visibly check who is asking, or be named below with the reason it needs no
-- check. The list is the review. A gate cannot tell a safe unchecked function
-- from an unsafe one; it can only make sure a person said which it was.

do $$
declare
  src text := pg_get_functiondef('public.security_report()'::regprocedure);
  anchor text := 'return query' || E'\n' || '  select ''anon_write_grants'', c.relname::text,';
  addition text;
begin
  if position('definer_reviewed' in src) > 0 then
    return; /* already carries it */
  end if;
  if position(anchor in src) = 0 then
    raise exception 'security_report() is not shaped the way this migration expected — read it before editing';
  end if;

  addition :=
    'return query' || E'\n' ||
    '  select ''definer_reviewed'', p.proname::text,' || E'\n' ||
    '         (pg_get_functiondef(p.oid) ~* ''auth\.uid\(\)|is_staff\(\)|is_door\(|auth\.role\(\)|p_token|sign_token|current_setting'')' || E'\n' ||
    '         or p.proname = any (array[' || E'\n' ||
    /* Each of these is reachable without checking its caller, and correct.
       The reason for every one is in the migration that added it here. */
    '           ''apply_with_invite'',      -- the invite code IS the authorization, and the path is paced' || E'\n' ||
    '           ''validate_invite'',        -- the same, checked and paced' || E'\n' ||
    '           ''check_promo'',            -- a promo code is the authorization; it reveals only that code' || E'\n' ||
    '           ''passes_left'',            -- how many places are left. Printed on the public page' || E'\n' ||
    '           ''segment_heads'',          -- how many heads a segment seats. Reference data' || E'\n' ||
    '           ''sponsor_credits'',        -- the credits shown on a public episode page' || E'\n' ||
    '           ''published_version'',      -- which version of a document is current; the document is public' || E'\n' ||
    '           ''episode_serves_alcohol'', -- whether a night carries anything with a minimum age' || E'\n' ||
    '           ''episode_manifest'',       -- who is aboard, gated on BOTH consent switches and on dues. Any member may read it, deliberately — consent text v2 says so' || E'\n' ||
    '           ''invite_season''           -- the active season, ordered to prefer a home city. The id picks an ordering and nothing else' || E'\n' ||
    '         ]),' || E'\n' ||
    '         ''reachable by '' || case when has_function_privilege(''anon'', p.oid, ''execute'') then ''anon'' else ''a member'' end ||' || E'\n' ||
    '           '' and nothing in it says who may call it''' || E'\n' ||
    '    from pg_proc p join pg_namespace n on n.oid = p.pronamespace' || E'\n' ||
    '   where n.nspname = ''public'' and p.prosecdef and p.prokind = ''f''' || E'\n' ||
    '     and (has_function_privilege(''anon'', p.oid, ''execute'')' || E'\n' ||
    '          or has_function_privilege(''authenticated'', p.oid, ''execute''));' || E'\n\n  ' ||
    anchor;

  execute replace(src, anchor, addition);
end $$;

notify pgrst, 'reload schema';
