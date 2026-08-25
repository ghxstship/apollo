-- One state, one word. profiles.status has been 'paused' since it was created,
-- the server action is pauseMembership(), and the button a member presses says
-- "Pause membership" — and then everything downstream called it a HOLD. The
-- dialog that button opened was titled "Weather hold?", the banner said
-- "Membership on weather hold", and every guard in the database raised "your
-- membership is on hold".
--
-- "Hold" is the wrong word twice over: it is the language every comparable
-- product spells "pause", and in THIS product a hold is a thing that happens to
-- a SAILING. The metaphor came off the membership in the previous change; this
-- takes the word off it too, in the place members actually read it — the guard
-- messages, which reach them verbatim because the guards speak in the club's
-- voice by design.
--
-- Rewritten from each function's own pg_get_functiondef rather than retyped.
-- Hand-copying a function body to change one string is how I dropped a line out
-- of a trigger earlier today; a faithful round-trip cannot.
do $$
declare
  f record;
  src text;
  n   integer := 0;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%membership is on hold%'
  loop
    src := pg_get_functiondef(f.oid);
    -- Longest first, so the general phrase does not eat the specific one.
    src := replace(src, 'your membership is on hold', 'your membership is paused');
    src := replace(src, 'membership is on hold',      'your membership is paused');
    execute src;
    n := n + 1;
  end loop;
  raise notice 're-voiced % function(s)', n;
end $$;

-- And the one that explains WHO may lift it, which is the only place the
-- distinction still matters: a member may resume a pause they placed, and must
-- ask Shoreside for one the club placed.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'set_own_standing';

  src := replace(
    src,
    'that hold was placed by the club — a word with Shoreside lifts it',
    'the club paused this membership — a word with Shoreside lifts it'
  );
  execute src;
end $$;
;
