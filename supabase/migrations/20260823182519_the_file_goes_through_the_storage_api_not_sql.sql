-- media_row_takes_its_file tried to delete the object in SQL. Storage refuses
-- that outright — its own protect_delete() trigger raises "Direct deletion from
-- storage tables is not allowed. Use the Storage API instead." — so the fix
-- never removed a single file AND made every voyage_media delete fail. A
-- guard that blocks the operation it was meant to complete is worse than the
-- gap it was closing.
--
-- Removing a frame is an application act with two halves, so the application
-- does both: the object through the Storage API, then the row. What is left
-- here is the record of anything that slips between them, so a sweep can find
-- it rather than the file lingering unnoticed.
drop trigger if exists media_row_takes_its_file on public.voyage_media;
drop function if exists public.media_row_takes_its_file();

create table if not exists public.orphaned_media (
  storage_path text primary key,
  noticed_at   timestamptz not null default now(),
  cleared_at   timestamptz
);

alter table public.orphaned_media enable row level security;

drop policy if exists "staff read orphaned media" on public.orphaned_media;
create policy "staff read orphaned media" on public.orphaned_media
  for select to authenticated using (public.is_staff());

comment on table public.orphaned_media is
  'Files whose voyage_media row is gone. Storage will not delete from SQL, so the application removes the object and only records here what it could not.';

create or replace function public.note_orphaned_media()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.storage_path is not null then
    insert into public.orphaned_media (storage_path)
    values (old.storage_path)
    on conflict (storage_path) do nothing;
  end if;
  return old;
end;
$$;

revoke execute on function public.note_orphaned_media() from public, anon, authenticated;

drop trigger if exists note_orphaned_media on public.voyage_media;
create trigger note_orphaned_media
  after delete on public.voyage_media
  for each row execute function public.note_orphaned_media();
