/* The storage bucket was the one thing the rename reached that is not a table.

   A mechanical pass rewrote `.from("voyage-media")` to `.from("episode-media")`
   in four call sites, and a bucket is addressed by a NAME, not by an OID — so
   nothing followed. Every signed URL came back empty: no error, no 404, just a
   frame with no src. The e2e suite caught it as "no signed URL on the media
   screen" and "no signed frame on the gallery", which is the only reason it was
   not shipped. A member would have watched the Open Deck and the gallery
   quietly go blank.

   Renaming a bucket is not a rename. storage.buckets has no ALTER ... RENAME,
   so the bucket is recreated under the new id and its objects are repointed.
   The four RLS policies on storage.objects match the literal bucket_id and are
   rewritten with it — a policy left matching the old string would admit
   nothing, which at least fails closed, but it fails.

   THE OLD BUCKET ROW IS LEFT IN PLACE, EMPTY. Supabase installs
   storage.protect_delete(), which refuses any delete from the storage tables
   in SQL and says to use the Storage API — a guard against exactly the kind of
   orphaning this migration would otherwise risk. Forcing past it is not worth
   it for a tidiness gain: an empty bucket costs nothing, and the guard is
   right. Remove it from the dashboard if it bothers anyone. */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'episode-media', 'episode-media', b.public, b.file_size_limit, b.allowed_mime_types
from storage.buckets b where b.id = 'voyage-media'
on conflict (id) do nothing;

do $$
declare n int;
begin
  update storage.objects set bucket_id = 'episode-media' where bucket_id = 'voyage-media';
  get diagnostics n = row_count;
  raise notice 'frames moved to the new bucket: %', n;
end $$;

drop policy if exists "aboard members upload voyage media" on storage.objects;
drop policy if exists "approved frames can be signed" on storage.objects;
drop policy if exists "owner or staff reads voyage media" on storage.objects;
drop policy if exists "owner or staff removes voyage media" on storage.objects;

/* Same rules, new bucket, and the names say episode now. The upload policy
   keeps every clause it had: the folder must be the uploader's own id, the path
   must be at least two segments deep, and the uploader must actually be
   aboard something. */
create policy "aboard members upload episode media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'episode-media'
    and owner = auth.uid()
    and public.is_active()
    and split_part(name, '/', 1) = (auth.uid())::text
    and array_length(string_to_array(name, '/'), 1) >= 2
    and exists (
      select 1 from public.passes r
      where r.profile_id = auth.uid() and r.status = 'aboard'::public.pass_status
    )
  );

create policy "approved frames can be signed" on storage.objects
  for select
  using (
    bucket_id = 'episode-media'
    and exists (
      select 1 from public.episode_media m
      where m.storage_path = objects.name and m.approved
    )
  );

create policy "owner or staff reads episode media" on storage.objects
  for select
  using (bucket_id = 'episode-media' and (owner = auth.uid() or public.is_staff()));

create policy "owner or staff removes episode media" on storage.objects
  for delete
  using (bucket_id = 'episode-media' and (owner = auth.uid() or public.is_staff()));

do $$
declare stragglers int;
begin
  select count(*) into stragglers from storage.objects where bucket_id = 'voyage-media';
  if stragglers > 0 then
    raise exception '% frames were left in the old bucket', stragglers;
  end if;
end $$;;
