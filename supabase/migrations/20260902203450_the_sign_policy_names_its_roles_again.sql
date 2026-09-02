/* When the media bucket moved I rewrote its four policies and dropped one
   clause without noticing: the original signing policy was created
   `for select to anon, authenticated`, and mine omitted the TO list, which
   defaults to PUBLIC.

   That looked equivalent and was not. An anonymous visitor could no longer
   sign an approved frame, so /gallery rendered empty — which is the EXACT
   failure the original migration was written to fix, and its own comment says
   so: "the row said public and the file said no". The e2e suite caught it
   twice, on the sign and on the gallery.

   Restored verbatim, including the storage.objects qualifier the original
   used, so the next person diffing this against the corpus finds them the
   same. */
drop policy if exists "approved frames can be signed" on storage.objects;

create policy "approved frames can be signed" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'episode-media'
    and exists (
      select 1 from public.episode_media m
      where m.storage_path = storage.objects.name
        and m.approved
    )
  );;
