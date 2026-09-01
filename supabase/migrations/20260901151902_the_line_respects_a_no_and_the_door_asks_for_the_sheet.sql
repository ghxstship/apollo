/* Two promises the UI made and the database ignored.

   1. "Claim it automatically — we take the pass the moment one frees" had a
      toggle whose column no code read: a member who switched auto-claim OFF
      was promoted and charged anyway. The promotion loop now skips them and
      tells them the seat opened instead — first in line still means first
      told, it just no longer means charged without asking.

   2. The member vetting page shows six gates; the database enforced four.
      "Preference Sheet complete" was a TSX derivation, so a cleared member
      with no sheet sailed past a screen still reading OPEN. The door now
      asks for the completed sheet — it feeds the ratio gate and the Pod
      blur, which is exactly why it exists. */

create or replace function public.handle_rsvp_release()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare
  nextup record; charges int; credits int; credit_due int; promoted record;
begin
  if tg_op = 'DELETE' or (old.status = 'aboard' and new.status <> 'aboard') then
    if old.status = 'aboard' then
      select coalesce(-sum(delta_cents), 0) into charges
      from public.account_ledger
      where profile_id = old.profile_id and voyage_id = old.voyage_id
        and delta_cents < 0 and kind in ('berth','deposit','addon');
      select coalesce(sum(delta_cents), 0) into credits
      from public.account_ledger
      where profile_id = old.profile_id and voyage_id = old.voyage_id and kind = 'credit';
      credit_due := charges - credits;
      if credit_due > 0 and exists (select 1 from public.voyages v where v.id = old.voyage_id and v.starts_at - now() > interval '48 hours') then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, created_by)
        values (old.profile_id, credit_due, 'credit', 'Pass released 48h+ out — full credit', old.voyage_id, old.profile_id);
      end if;

      delete from public.rsvp_addons where rsvp_id = old.id;

      update public.installment_plans
         set status = 'cancelled', next_charge_at = null
       where rsvp_id = old.id and status = 'active';

      for nextup in
        select r.*, p.email, p.full_name, p.notification_prefs
        from public.rsvps r join public.profiles p on p.id = r.profile_id
        where r.voyage_id = old.voyage_id
          and r.status = 'waitlist'
          and r.id <> old.id
          and r.profile_id <> old.profile_id
        order by r.created_at asc
      loop
        -- The toggle, honoured. A member who said "don't take it for me" is
        -- told the water opened and keeps their place in line; the claim is
        -- theirs to make from the manifest.
        if not coalesce(nextup.auto_claim, true) then
          if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
            insert into public.notifications (profile_id, kind, title, body)
            select nextup.profile_id, 'manifest', 'A pass opened: ' || v.title,
                   'You asked to claim by hand. The pass is on the manifest now — first come, first aboard.'
            from public.voyages v where v.id = old.voyage_id;
          end if;
          continue;
        end if;

        begin
          update public.rsvps set status = 'aboard' where id = nextup.id;
        exception when others then
          continue;
        end;

        if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body)
          select nextup.profile_id, 'manifest', 'A pass released to you: ' || v.title,
                 'You were first in order on the waitlist. You''re aboard — release it within 48 hours if the tide has turned.'
          from public.voyages v where v.id = old.voyage_id;

          select r.boarding_code into promoted from public.rsvps r where r.id = nextup.id;

          insert into public.email_outbox (to_email, template, payload)
          select nextup.email, 'waitlist-release',
                 jsonb_build_object('name', nextup.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                    'code', promoted.boarding_code,
                                    'muster', coalesce(v.muster, 'Gangway B-12'))
          from public.voyages v where v.id = old.voyage_id and nextup.email is not null;
        end if;
        exit;
      end loop;
    end if;
  end if;
  return coalesce(new, old);
end $fn$;

-- The door asks for the whole file: sheet included.
do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_the_vetting';
  if src not like '%your clearance lapsed on %' then
    raise exception 'guard_the_vetting does not look like the function this patch was written for';
  end if;
  patched := replace(src,
$anchor$  if f.cleared_until is not null and f.cleared_until <= now() then$anchor$,
$patch$  if not exists (
    select 1 from public.preference_sheets s
    where s.profile_id = new.profile_id and s.completed_at is not null
  ) then
    raise exception 'the Preference Sheet finishes your file — three parts, five minutes, on the vetting page';
  end if;
  if f.cleared_until is not null and f.cleared_until <= now() then$patch$);
  if patched = src then raise exception 'the vetting patch anchored on nothing'; end if;
  execute patched;
end $mig$;;
