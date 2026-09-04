-- On the 2nd both episodes.sub_class and membership_plans.class_ceiling were
-- renamed voyage -> passage, with a note that renaming one side without the
-- other would admit members to passes they are not entitled to. The guard that
-- compares them was the third side and was never told: it still spells the
-- bottom rung 'voyage', so a 'passage' ceiling falls through to the top rung
-- and an Access member books an odyssey. Proven on the replay. Patched in place
-- because pass_guard has been rewritten by surgery five times and a fresh copy
-- would silently drop one of those.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'pass_guard' and p.pronamespace = 'public'::regnamespace;
  if src not like '%in (''voyage'',''expedition'',''odyssey'')%'
     or src not like '%case plan.class_ceiling when ''voyage'' then 1%'
     or src not like '%case v.sub_class when ''voyage'' then 1%' then
    raise exception 'pass_guard no longer carries the three voyage literals — re-read it before patching';
  end if;
  src := replace(src, 'in (''voyage'',''expedition'',''odyssey'')', 'in (''passage'',''expedition'',''odyssey'')');
  src := replace(src, 'case plan.class_ceiling when ''voyage'' then 1', 'case plan.class_ceiling when ''passage'' then 1');
  src := replace(src, 'case v.sub_class when ''voyage'' then 1', 'case v.sub_class when ''passage'' then 1');
  execute src;
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'pass_guard' and p.pronamespace = 'public'::regnamespace;
  if src like '%''voyage''%' then raise exception 'a voyage literal survives in pass_guard'; end if;
end $$;;
