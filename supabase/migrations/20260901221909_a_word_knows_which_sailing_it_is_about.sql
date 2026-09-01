-- carry_the_clock kept its Words idempotent by TITLE — 'Boarding: ' || title —
-- which held while every sailing had its own name. A series gives every
-- occurrence the template's title, so the second Saturday's five Words were
-- silently suppressed for anyone who sailed the first. A Word about a sailing
-- now carries the sailing's id, and the not-exists guards key on it. Legacy
-- rows carry null and still dedupe by title, so nothing in flight re-sends.
alter table public.notifications
  add column voyage_id uuid references public.voyages(id) on delete set null;
create index if not exists notifications_profile_voyage_idx
  on public.notifications (profile_id, voyage_id) where voyage_id is not null;

create or replace function public.carry_the_clock()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v record; r record; sent int := 0;
begin
  -- T-48h: the gangway-details letter and its Word.
  for v in select * from public.voyages
           where status in ('scheduled','live')
             and starts_at - interval '48 hours' <= now() and starts_at > now() loop
    for r in select rv.boarding_code, p.id pid, p.email, p.full_name, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = v.id and rv.status = 'aboard' loop
      if r.email is not null and not exists (
        select 1 from public.email_outbox
        where to_email = r.email and template = 'gangway-details'
          and payload->>'voyage_id' = v.id::text) then
        insert into public.email_outbox (to_email, template, payload)
        values (r.email, 'gangway-details',
                jsonb_build_object('name', r.full_name, 'voyage', v.title, 'voyage_id', v.id,
                                   'starts_at', v.starts_at, 'code', r.boarding_code,
                                   'muster', coalesce(v.muster, 'Gangway B-12')));
        sent := sent + 1;
      end if;
      if coalesce((r.notification_prefs->>'berths')::boolean, true) and not exists (
        select 1 from public.notifications
        where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
          and title = 'Gangway details: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'manifest', 'Gangway details: ' || v.title,
                'Muster ' || coalesce(v.muster, 'Gangway B-12') || '. Your code is on your member card — brightness up at the gangway.',
                v.id);
      end if;
    end loop;
  end loop;

  -- The day itself: five words, each once per sailing, always delivered.
  for v in select vv.*, vr.opens_at, vr.anchors_unlock_at
           from public.voyages vv left join public.voyage_radar vr on vr.voyage_id = vv.id
           where vv.status in ('scheduled','live')
             and vv.starts_at - interval '2 hours' <= now()
             and coalesce(vv.ends_at, vv.starts_at + interval '12 hours') + interval '6 hours' > now() loop
    for r in select p.id pid from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = v.id and rv.status = 'aboard' loop
      if v.starts_at > now() and not exists (select 1 from public.notifications
            where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
              and title = 'Two hours to the gangway: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'word', 'Two hours to the gangway: ' || v.title, 'Riviera Chic, sun up, phones down. The water is waiting.', v.id);
      end if;
      if v.starts_at <= now() and not exists (select 1 from public.notifications
            where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
              and title = 'Boarding: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'word', 'Boarding: ' || v.title, 'The gangway is open. Muster ' || coalesce(v.muster, 'Gangway B-12') || '.', v.id);
      end if;
      if v.opens_at is not null and v.opens_at <= now() and not exists (select 1 from public.notifications
            where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
              and title = 'The Radar is live: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'word', 'The Radar is live: ' || v.title, 'Fifteen minutes on the sweep. Plot your courses — it locks at half past.', v.id);
      end if;
      if v.anchors_unlock_at is not null and v.anchors_unlock_at <= now() and not exists (select 1 from public.notifications
            where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
              and title = 'The Captain''s Log is unsealed: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'word', 'The Captain''s Log is unsealed: ' || v.title, 'Gold foil, your name, one day to open it. Shared Anchors surface for a day.', v.id);
      end if;
      if v.ends_at is not null and v.ends_at <= now() and not exists (select 1 from public.notifications
            where profile_id = r.pid and (voyage_id = v.id or voyage_id is null)
              and title = 'Docked: ' || v.title) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.pid, 'word', 'Docked: ' || v.title, 'Lines ashore, all well. What the cameras kept lands in Episodes.', v.id);
      end if;
    end loop;
  end loop;

  return sent;
end $$;;
