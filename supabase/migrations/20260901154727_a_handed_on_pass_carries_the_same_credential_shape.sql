/* 20260901004433 moved boarding-code minting into mint_boarding_code(voyage,
   member_no) and patched handle_rsvp_aboard — one of the two callers.
   accept_pass_transfer still built the four-segment code inline, so a
   transferred pass minted the very collision shape that migration exists to
   prevent, and could die on the uniqueness index with a raw 23505. The
   remediation suite's five-segment assertion caught it on the first walk the
   transfer path has ever had.

   (First attempt at this patch refused on its own anchor — written before
   reading the function. The guard held; this one is anchored on the mint's
   actual text.) */
do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_pass_transfer';
  patched := replace(src,
$old$  new_code := 'UN-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
    || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);$old$,
$new$  new_code := public.mint_boarding_code(v.id, m);$new$);
  if patched = src then
    raise exception 'the transfer-mint patch anchored on nothing — the inline mint is not where this migration left it';
  end if;
  execute patched;
end $mig$;;
