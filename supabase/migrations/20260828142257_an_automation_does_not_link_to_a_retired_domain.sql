-- run_automations() hardcoded the member-app origin into every SMS payload it
-- builds and still pointed at the retired domain. Latent today — no SMS
-- automation is active — but it fires the moment one is enabled, and the link
-- goes to a member's phone.
--
-- The earlier sweeps fixed the ROWS these functions write, and matched the
-- literal 'SYR-' inside pg_proc. A bare domain in a function body matched
-- neither. This repairs every function carrying one, then checks all of them
-- rather than the one I happened to look at.
do $$
declare p record; src text; out text; n int := 0;
begin
  for p in
    select oid from pg_proc
     where pronamespace = 'public'::regnamespace and prokind = 'f'
       and pg_get_functiondef(oid) ~* '(syrius|lyre)\.social'
  loop
    src := pg_get_functiondef(p.oid);
    out := regexp_replace(src, '(https?://)?(www\.)?(syrius|lyre)\.social', 'https://unhingedsocial.us', 'gi');
    if out <> src then execute out; n := n + 1; end if;
  end loop;
  raise notice 'repaired % function body(ies)', n;
end $$;

-- security_report carries the brand in a COMMENT — "Syrius additions,
-- deliberately public" — naming the era those tables arrived in. Rewriting it
-- to "[UN] additions" would be false; they were not added under this name. It
-- says what they ARE instead, which is what the reader needed either way.
do $$
declare src text; out text;
begin
  src := pg_get_functiondef('public.security_report'::regproc);
  out := replace(src, '-- Syrius additions, deliberately public:', '-- The charter-era tables, deliberately public:');
  if out = src then raise exception 'the security_report comment is not where it was expected'; end if;
  execute out;
end $$;

do $$
declare p record; found text := '';
begin
  for p in
    select oid::regprocedure as sig from pg_proc
     where pronamespace = 'public'::regnamespace and prokind = 'f'
  loop
    if pg_get_functiondef(p.sig) ~* '(\m(syrius|lyre)\M)' then
      found := found || format(E'\n    %s', p.sig);
    end if;
  end loop;
  if found <> '' then
    raise exception 'a retired brand is still inside a function body:%', found;
  end if;
end $$;;
