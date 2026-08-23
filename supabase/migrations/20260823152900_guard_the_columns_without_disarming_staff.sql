-- I reached for column grants to stop a host rewriting their guest's consent and
-- a member clearing their own frame. Column grants belong to the ROLE, and staff
-- are `authenticated` too — so the same revoke took the approve button off the
-- Bridge and stopped the gangway stamping a guest aboard. The e2e caught both.
--
-- A guard trigger can ask who is asking. Grants go back; the rule stays.
grant update on public.voyage_media to authenticated;
grant update on public.rsvp_guests to authenticated;

create or replace function public.guard_media_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  if new.approved is distinct from old.approved then
    raise exception 'a frame is cleared from the Bridge, not from here';
  end if;
  if new.voyage_id is distinct from old.voyage_id
     or new.uploaded_by is distinct from old.uploaded_by
     or new.storage_path is distinct from old.storage_path then
    raise exception 'that is not yours to move';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_media_approval() from public, anon, authenticated;

drop trigger if exists guard_media_approval on public.voyage_media;
create trigger guard_media_approval
  before update on public.voyage_media
  for each row execute function public.guard_media_approval();

create or replace function public.guard_guest_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  if new.on_camera is distinct from old.on_camera then
    raise exception 'that is the guest''s to say, not yours';
  end if;
  if new.boarding_code is distinct from old.boarding_code
     or new.sign_token is distinct from old.sign_token
     or new.rsvp_id is distinct from old.rsvp_id then
    raise exception 'a guest pass is issued by the club';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_guest_columns() from public, anon, authenticated;

drop trigger if exists guard_guest_columns on public.rsvp_guests;
create trigger guard_guest_columns
  before update on public.rsvp_guests
  for each row execute function public.guard_guest_columns();
