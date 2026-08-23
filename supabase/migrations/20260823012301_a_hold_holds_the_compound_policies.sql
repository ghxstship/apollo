-- The compound policies keep their own conditions and gain the hold check.
alter policy "enter yourself" on public.contest_entries
with check (
  profile_id = auth.uid()
  and public.is_active()
  and exists (
    select 1 from public.contests c
    where c.id = contest_entries.contest_id
      and c.status = 'open'
      and now() < c.ends_at
      and (c.scope = 'member' or exists (
        select 1 from public.rsvps r
        where r.voyage_id = c.voyage_id and r.profile_id = auth.uid() and r.status = 'aboard'
      ))
  )
);

alter policy "write to own threads" on public.messages
with check (
  author_id = auth.uid()
  and public.is_active()
  and public.in_thread(thread_id)
  and not exists (
    select 1 from public.threads t
    where t.id = messages.thread_id and t.closed_at is not null
  )
);

alter policy "offer own pass" on public.pass_transfers
with check (
  from_profile = auth.uid()
  and public.is_active()
  and exists (
    select 1 from public.rsvps r
    where r.id = pass_transfers.rsvp_id and r.profile_id = auth.uid() and r.status = 'aboard'
  )
);

alter policy "pick from your own chair" on public.table_picks
with check (
  picker = auth.uid()
  and public.is_active()
  and exists (select 1 from public.table_seats s
              where s.table_id = table_picks.table_id and s.profile_id = auth.uid() and s.state = 'confirmed')
  and exists (select 1 from public.table_seats s
              where s.table_id = table_picks.table_id and s.profile_id = table_picks.picked and s.state = 'confirmed')
  and exists (select 1 from public.dating_tables t join public.voyages v on v.id = t.voyage_id
              where t.id = table_picks.table_id and v.starts_at < now())
);

alter policy "flag a post" on public.wardroom_flags
with check (flagger_id = auth.uid() and public.is_active());
