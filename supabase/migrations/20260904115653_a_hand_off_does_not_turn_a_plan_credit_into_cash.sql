-- accept_pass_transfer credits the giver everything they were charged and
-- charges the taker the same, but it sums pass, deposit, addon and credit and
-- never plan_credit. A pass the plan paid for therefore hands back as cash: the
-- giver leaves with a positive house balance they never funded and their
-- month's allowance still marked spent. A Founding member could turn the whole
-- allowance into house cash by booking and handing on. This reads the plan
-- credit the way the release does — subtract what the plan applied, add back
-- what this month's allowance can take back, and post the reversal as a row —
-- and raises the hand-off flag before the pass moves so the gangway guard lets
-- the new code through. Surgery, because the function was itself rewritten by
-- surgery and a fresh copy would drop one of those.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'accept_pass_transfer' and p.pronamespace = 'public'::regnamespace;
  if src not like '%new_code text; dep_part int;%'
     or src not like '%and kind in (''pass'', ''deposit'', ''addon'', ''credit'');%'
     or src not like '%net := least(greatest(net, 0), greatest(cap, 0));%'
     or src not like '%  update public.passes
     set profile_id = t.to_profile, boarding_code = new_code,%' then
    raise exception 'accept_pass_transfer does not read as expected — trace its rewrites before patching';
  end if;
  src := replace(src, 'new_code text; dep_part int;',
                      'new_code text; dep_part int; plan_applied int := 0; plan_returned int := 0; v_period date;');
  src := replace(src, 'and kind in (''pass'', ''deposit'', ''addon'', ''credit'');',
$p$and kind in ('pass', 'deposit', 'addon', 'credit');
  select coalesce(sum(delta_cents), 0) into plan_applied
    from public.account_ledger
   where rsvp_id = t.rsvp_id and profile_id = t.from_profile and kind = 'plan_credit';
  v_period := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  if plan_applied > 0 then
    select greatest(coalesce(sum(delta_cents), 0), 0) into plan_returned
      from public.account_ledger
     where rsvp_id = t.rsvp_id and profile_id = t.from_profile and kind = 'plan_credit'
       and date_trunc('month', (created_at at time zone 'America/New_York'))
           = date_trunc('month', (now() at time zone 'America/New_York'));
  end if;
  net := net - plan_applied + plan_returned;$p$);
  src := replace(src, 'net := least(greatest(net, 0), greatest(cap, 0));',
$p$net := least(greatest(net, 0), greatest(cap, 0));
  if plan_returned > 0 then
    update public.pass_credits
       set spent_cents = greatest(0, spent_cents - plan_returned)
     where profile_id = t.from_profile and period = v_period;
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id)
    values (t.from_profile, -plan_returned, 'plan_credit', 'Membership credit returned — ' || v.title, v.id, t.rsvp_id);
  end if;$p$);
  src := replace(src, '  update public.passes
     set profile_id = t.to_profile, boarding_code = new_code,',
'  perform set_config(''app.accepting_pass'', ''on'', true);
  update public.passes
     set profile_id = t.to_profile, boarding_code = new_code,');
  execute src;
end $$;;
