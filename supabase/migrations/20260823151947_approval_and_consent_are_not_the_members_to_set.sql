-- Policies that asked "is this row about me" where they should have asked "is
-- this mine to decide": an aboard member could publish a frame straight to the
-- public gallery past the Bridge queue; a crew seat outlived the pass that
-- granted it; and a member could mint a vanity invite with unlimited uses.
do $$
begin
  if exists (select 1 from pg_policy
             where polrelid='public.voyage_media'::regclass and polname='aboard members upload') then
    execute $p$
      alter policy "aboard members upload" on public.voyage_media
      with check (
        uploaded_by = auth.uid()
        and public.is_active()
        and coalesce(approved, false) = false
        and exists (select 1 from public.rsvps r
                    where r.voyage_id = voyage_media.voyage_id
                      and r.profile_id = auth.uid() and r.status = 'aboard')
      )
    $p$;
  end if;
end $$;

-- A crew seat is an entitlement of holding the pass. join_crew_thread seated a
-- member when they went aboard and nothing ever un-seated them, so a member who
-- released kept reading and posting in that sailing's private room forever.
create or replace function public.crew_seat_follows_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' or old.status = 'aboard' then
    if not exists (
      select 1 from public.rsvps r
      where r.profile_id = old.profile_id and r.voyage_id = old.voyage_id
        and r.status = 'aboard' and r.id <> old.id
    ) then
      delete from public.thread_members tm using public.threads t
      where tm.thread_id = t.id and t.kind = 'crew'
        and t.voyage_id = old.voyage_id and tm.profile_id = old.profile_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.crew_seat_follows_the_pass() from public, anon, authenticated;

drop trigger if exists crew_seat_follows_the_pass on public.rsvps;
create trigger crew_seat_follows_the_pass
  after delete or update of status on public.rsvps
  for each row execute function public.crew_seat_follows_the_pass();

alter policy "mint own invite" on public.invites
with check (
  inviter_id = auth.uid()
  and public.is_active()
  and coalesce(uses, 0) = 0
  and coalesce(max_uses, 3) between 1 and 3
  and code ~ '^SYR-[A-Z0-9]{4}-[A-Z0-9]{4}$'
);
