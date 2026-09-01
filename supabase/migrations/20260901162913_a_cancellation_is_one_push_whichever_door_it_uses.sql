-- The cancel branch writes a manifest notification (fan_out pushes it when the
-- berths switch is on) AND a direct push_outbox row "past" the switch — so a
-- member with the switch ON was pushed twice per cancellation. The direct row
-- exists for the member the switch would silence; it must go only to them.
do $$
declare
  src text := pg_get_functiondef('public.handle_voyage_status()'::regprocedure);
  sel text := $a$    for r in select rv.profile_id, p.email, p.full_name
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      select coalesce(-sum(delta_cents), 0) into net$a$;
  push text := $b$      insert into public.push_outbox (profile_id, title, body, url)
      values (r.profile_id, 'Cancelled: ' || new.title, 'Your account is credited in full.', '/manifest');$b$;
begin
  if position(sel in src) = 0 then
    raise exception 'anchor missing: cancel-branch select — read the live function before patching';
  end if;
  if position(push in src) = 0 then
    raise exception 'anchor missing: direct push insert — read the live function before patching';
  end if;

  src := replace(src, sel, $a$    for r in select rv.profile_id, p.email, p.full_name, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      select coalesce(-sum(delta_cents), 0) into net$a$);

  src := replace(src, push, $b$      -- Only for the member the berths switch would silence: fan_out already
      -- pushes the manifest notice to everyone whose switch is on. One push,
      -- whichever door it comes through.
      if not coalesce((r.notification_prefs->>'berths')::boolean, true) then
        insert into public.push_outbox (profile_id, title, body, url)
        values (r.profile_id, 'Cancelled: ' || new.title, 'Your account is credited in full.', '/manifest');
      end if;$b$);

  execute src;
end $$;;
