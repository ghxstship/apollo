-- Four things the last pass missed.
--
-- 1. Nothing stopped a member walking onto a voyage that had already sailed.
--    An aboard insert on a completed sailing returned 201, banked 25 knots by
--    trigger, and fabricated attendance that fed contest standings, the
--    directory's shared-voyages affinity and the Bridge's fill reports.
-- 2. voyage_media was the one member-write policy that never got is_active().
-- 3. rsvps had no staff INSERT policy, so the box office could never walk
--    anyone onto a manifest — addToManifest has never worked.
-- 4. wardroom_flags.post_id cascaded from wardroom_posts, so removing a post
--    deleted the flag row the action had just stamped 'removed'. Every removal
--    destroyed its own audit record.
create or replace function public.rsvp_not_in_the_past()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_starts timestamptz; v_status text;
begin
  if public.is_staff() then return new; end if;
  if new.status <> 'aboard' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'aboard' then return new; end if;

  select starts_at, status::text into v_starts, v_status
  from public.voyages where id = new.voyage_id;

  if v_status in ('completed', 'cancelled') then
    raise exception 'that sailing is in the log, not on the manifest';
  end if;
  if v_starts is not null and v_starts <= now() then
    raise exception 'that sailing has already left';
  end if;
  return new;
end;
$$;

revoke execute on function public.rsvp_not_in_the_past() from public, anon, authenticated;

drop trigger if exists rsvp_not_in_the_past on public.rsvps;
create trigger rsvp_not_in_the_past
  before insert or update of status on public.rsvps
  for each row execute function public.rsvp_not_in_the_past();

do $$
begin
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.voyage_media'::regclass and polname = 'aboard members upload'
  ) then
    execute $p$
      alter policy "aboard members upload" on public.voyage_media
      with check (
        uploaded_by = auth.uid()
        and public.is_active()
        and exists (
          select 1 from public.rsvps r
          where r.voyage_id = voyage_media.voyage_id
            and r.profile_id = auth.uid()
            and r.status = 'aboard'
        )
      )
    $p$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.rsvps'::regclass and polname = 'staff seat a member'
  ) then
    create policy "staff seat a member" on public.rsvps
      for insert to authenticated
      with check (public.is_staff());
  end if;
end $$;

alter table public.wardroom_flags
  drop constraint if exists wardroom_flags_post_id_fkey;
alter table public.wardroom_flags
  add constraint wardroom_flags_post_id_fkey
  foreign key (post_id) references public.wardroom_posts(id) on delete set null;

alter table public.wardroom_flags alter column post_id drop not null;

comment on column public.wardroom_flags.post_id is
  'Null once the post is removed — the flag is the moderation record and outlives what it was about.';
