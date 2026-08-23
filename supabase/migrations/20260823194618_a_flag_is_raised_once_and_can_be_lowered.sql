-- wardroom_flags had a primary key on id and nothing else: no unique on
-- (post_id, flagger_id), so one member could raise the same flag against the
-- same post as many times as they liked and flood the Bridge's queue; and no
-- DELETE policy at all, so a flag raised by mistake could never be withdrawn —
-- the attempt returned 200 [] and the UI called it done. Not even staff could
-- remove one, which is why an audit had to clear its own rows out of band.
delete from public.wardroom_flags a
using public.wardroom_flags b
where a.post_id is not null
  and a.post_id = b.post_id
  and a.flagger_id = b.flagger_id
  and a.ctid > b.ctid;

create unique index if not exists one_flag_per_post_per_member
  on public.wardroom_flags (post_id, flagger_id)
  where post_id is not null;

-- Withdrawing your own flag, while it is still open. Once the Bridge has ruled
-- on it the flag is part of the record.
drop policy if exists "lower your own flag" on public.wardroom_flags;
create policy "lower your own flag" on public.wardroom_flags
  for delete to authenticated
  using (flagger_id = auth.uid() and status = 'open');

drop policy if exists "staff clear a flag" on public.wardroom_flags;
create policy "staff clear a flag" on public.wardroom_flags
  for delete to authenticated
  using (public.is_staff());

comment on index public.one_flag_per_post_per_member is
  'One member, one flag, one post. Raising it again is not a second concern.';;
