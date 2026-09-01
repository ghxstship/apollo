-- The mint could hand two different sailings the same boarding code, and the
-- unique index added minutes ago proved it on real data rather than in theory:
-- e2e-radar-… and e2e-ratio-… both reduce to slug4 EERA, because stripping
-- non-alpha from "e2e-" leaves two e's and only two letters of the real name
-- survive. Same day, same member, identical credential.
--
--   'UN-' || left(alpha(slug),4) || '-' || MMDD || '-' || right(member_no,4)
--
-- No year, no per-sailing component. It collides whenever two voyages share
-- four leading letters and a calendar day — not a test artefact:
-- "the-solstice-run" and "the-solstice-return" collide, as do any two sailings
-- of a season that begin alike on one day.
--
-- The consequence is a person, not an error. The "which sailing was this pass
-- for?" lookup is .eq(code).maybeSingle(), which returns PGRST116 on two rows
-- and reads as no-match — so the holder of a GENUINE pass is shown the forgery
-- message at the dock.
--
-- MY FIRST FIX ONLY DEFERRED IT. It appended a discriminator when the base was
-- "already taken", so two sailings that had not yet issued a pass both saw the
-- base free and both returned it; the clash then surfaced as a failed insert
-- against the new index. A uniqueness rule that depends on who mints first is
-- not a uniqueness rule. The discriminator is now unconditional, so the code is
-- distinct BY CONSTRUCTION rather than by luck of ordering.
--
-- It is derived from the voyage, never random: the same sailing must always
-- yield the same code for a member, or a printed card would stop matching its
-- own row — which is worse than the collision it fixes.
create or replace function public.mint_boarding_code(p_voyage uuid, p_member_no text)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare v record;
begin
  select slug, starts_at, time_zone into v from public.voyages where id = p_voyage;
  return 'UN-' || upper(left(regexp_replace(v.slug, '[^a-zA-Z]', '', 'g'), 4))
      || '-' || to_char(v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'), 'MMDD')
      || '-' || right(coalesce(p_member_no, '0000'), 4)
      || '-' || upper(substr(md5(p_voyage::text), 1, 2));
end $function$;

do $$
declare src text; out text;
begin
  src := pg_get_functiondef('public.handle_rsvp_aboard'::regproc);
  out := replace(src,
    $old$      new.boarding_code := 'UN-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
        || '-' || to_char(v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'), 'MMDD')
        || '-' || right(coalesce(m,'0000'),4);$old$,
    $new$      new.boarding_code := public.mint_boarding_code(new.voyage_id, m);$new$);
  if out = src then
    raise exception 'the mint is not where it was expected in handle_rsvp_aboard';
  end if;
  execute out;
end $$;

revoke execute on function public.mint_boarding_code(uuid, text) from public, anon, authenticated;

do $$
declare a uuid; b uuid; m text; c_a text; c_b text; again text;
begin
  select id into a from public.voyages where slug like 'e2e-radar-%' order by created_at desc limit 1;
  select id into b from public.voyages where slug like 'e2e-ratio-%' order by created_at desc limit 1;
  select member_no into m from public.profiles where member_no is not null order by member_no limit 1;
  if a is null or b is null then
    raise notice 'the colliding fixtures are gone — skipping the behavioural check';
    return;
  end if;
  c_a := public.mint_boarding_code(a, m);
  c_b := public.mint_boarding_code(b, m);
  again := public.mint_boarding_code(a, m);
  if c_a = c_b then raise exception 'two sailings still mint the same code: %', c_a; end if;
  if c_a <> again then raise exception 'the same sailing minted two different codes: % then %', c_a, again; end if;
  raise notice 'distinct and stable: % vs %', c_a, c_b;
end $$;;
