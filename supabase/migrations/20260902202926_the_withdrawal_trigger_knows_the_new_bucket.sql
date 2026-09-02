/* The last thing holding the old bucket name, and the one that mattered most.

   withdrawn_frames_leave_their_path deletes the FILE when a member takes their
   frame back off the water — the whole point of it being a trigger is that the
   row and the object cannot drift apart. It matched on bucket_id =
   'voyage-media', so after the bucket moved it deleted nothing: the row went,
   the file stayed, and a signed URL issued moments earlier would have kept
   resolving to a frame its owner had withdrawn.

   That is a consent failure, not a tidiness one. It is also invisible from the
   application, which is why the e2e suite has a check that goes and looks at
   the path afterwards. */
do $$
declare fn record; src text; out text; n int := 0;
begin
  for fn in
    select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'withdrawn_frames_leave_their_path'
  loop
    src := pg_get_functiondef(fn.oid);
    out := replace(src, 'voyage-media', 'episode-media');
    if out is distinct from src then execute out; n := n + 1; end if;
  end loop;
  if n = 0 then
    raise exception 'the withdrawal trigger did not name the old bucket — check it by hand before assuming this is done';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','storage') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%voyage-media%'
  ) then
    raise exception 'something still names the old bucket';
  end if;
end $$;;
