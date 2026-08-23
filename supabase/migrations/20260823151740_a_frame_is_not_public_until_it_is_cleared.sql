-- public.voyage_media is carefully gated. The BYTES had none of that: the bucket
-- was public:true with SELECT granted to `public` for the whole bucket, and
-- INSERT asking only owner = auth.uid(). A paused account could write, any
-- member could write into any other member's folder or the root, and anonymous
-- callers could LIST every object and fetch any of them — including frames
-- pulled for consent, which removeMedia left behind.
update storage.buckets set public = false where id = 'voyage-media';

drop policy if exists "anyone reads voyage media" on storage.objects;
drop policy if exists "members upload voyage media" on storage.objects;

create policy "owner or staff reads voyage media" on storage.objects
  for select to authenticated
  using (bucket_id = 'voyage-media' and (owner = auth.uid() or public.is_staff()));

create policy "aboard members upload voyage media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voyage-media'
    and owner = auth.uid()
    and public.is_active()
    and split_part(name, '/', 1) = auth.uid()::text
    and array_length(string_to_array(name, '/'), 1) >= 2
    and exists (select 1 from public.rsvps r where r.profile_id = auth.uid() and r.status = 'aboard')
  );

create or replace function public.media_row_takes_its_file()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'storage'
as $$
begin
  delete from storage.objects where bucket_id = 'voyage-media' and name = old.storage_path;
  return old;
end;
$$;

revoke execute on function public.media_row_takes_its_file() from public, anon, authenticated;

drop trigger if exists media_row_takes_its_file on public.voyage_media;
create trigger media_row_takes_its_file
  after delete on public.voyage_media
  for each row execute function public.media_row_takes_its_file();
