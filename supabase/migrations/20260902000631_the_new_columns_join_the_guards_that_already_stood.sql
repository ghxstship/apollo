-- A new column does not join an existing guard by itself. hold_reason decides
-- whether a payment lifts a hold; sponsor_id decides whose account a comp sits
-- on. Neither is a member's to write.
do $$
declare src text; a text;
begin
  src := pg_get_functiondef('public.guard_privileged_profile_columns()'::regprocedure);
  a := $a$  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: plan_id'; end if;
  src := replace(src, a, $a$  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.hold_reason is distinct from old.hold_reason then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;$a$);
  execute src;

  src := pg_get_functiondef('public.guard_pass_exemptions()'::regprocedure);
  a := $a$  if tg_op = 'INSERT' then
    if coalesce(new.comp, false) then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  else
    if coalesce(new.comp, false) is distinct from coalesce(old.comp, false) then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: comp'; end if;
  src := replace(src, a, $a$  if tg_op = 'INSERT' then
    if coalesce(new.comp, false) or new.sponsor_id is not null then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  else
    if coalesce(new.comp, false) is distinct from coalesce(old.comp, false)
       or new.sponsor_id is distinct from old.sponsor_id then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  end if;$a$);
  execute src;
end $$;;
