-- A new table inherits this project's default grants, which hand anon the full
-- set. RLS stops the writes, but a grant nobody needs is a second lock waiting
-- to be left open — the invariant check is right to refuse it. Only the definer
-- trigger writes here.
revoke all on public.orphaned_media from anon, authenticated;
grant select on public.orphaned_media to authenticated;
