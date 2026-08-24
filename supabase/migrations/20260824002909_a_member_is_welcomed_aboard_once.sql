-- accept_application had no idempotence test. member_roll is protected by
-- `on conflict do nothing`, but the welcome email is not, and neither is the
-- 250-knot referral award or the inviter's notification. Called twice — two
-- operators on the Bridge, or one double-click before the page revalidates —
-- it queued TWO welcome-aboard emails 155ms apart, and would have paid the
-- referral twice.
--
-- Accepting someone is a thing that happens once. Say so at the top, and
-- return quietly rather than raising: the second operator did nothing wrong
-- and does not need an error, they need the screen to agree with the first.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_application' limit 1;

  newsrc := replace(src,
    E'  if a.id is null then raise exception ''no such application''; end if;\n',
    E'  if a.id is null then raise exception ''no such application''; end if;\n'
    '  -- Already aboard: the welcome, the referral award and the inviter''s\n'
    '  -- notification have all happened. Doing them again is not idempotent, it\n'
    '  -- is a second welcome and a second payout.\n'
    '  if a.status = ''aboard'' then return; end if;\n');

  if newsrc = src then
    raise exception 'could not place the idempotence test in accept_application';
  end if;
  execute newsrc;
end $outer$;;
