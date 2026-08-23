-- guard_media_approval and guard_own_frame both fired BEFORE UPDATE and
-- disagreed. Alphabetical order decided it: the first raised before the second
-- could normalise, so half of guard_own_frame was unreachable. Two guards on
-- one table, where which one wins depends on their names, is how a rule ends
-- up enforced on paper and not in fact. One guard, stating the whole rule.
--
-- It also settles an inconsistency the pair left behind: a member could delete
-- their own frame outright but not merely take it off the water, because
-- setting approved to false was refused. Withdrawal is the smaller act; if the
-- larger one is allowed, refusing this one only pushes people to delete.
drop trigger if exists guard_own_frame on public.voyage_media;
drop function if exists public.guard_own_frame();

create or replace function public.guard_media_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  -- A frame stays on the sailing it was shot on, under the hand that sent it.
  if new.voyage_id    is distinct from old.voyage_id
     or new.uploaded_by  is distinct from old.uploaded_by
     or new.storage_path is distinct from old.storage_path
     or new.id           is distinct from old.id then
    raise exception 'that is not yours to move';
  end if;
  new.created_at := old.created_at;

  -- Clearing a frame for the water is the Bridge's call and nobody else's.
  if new.approved and not coalesce(old.approved, false) then
    raise exception 'a frame is cleared from the Bridge, not from here';
  end if;

  -- Taking your own frame back off the water is yours. So is rewriting your
  -- caption — but the caption the Bridge cleared is not the one you replace it
  -- with, so an edit returns the frame to the queue rather than quietly
  -- changing what is already published.
  if new.uploaded_by <> auth.uid() then
    raise exception 'that frame is not yours';
  end if;
  if new.caption is distinct from old.caption then
    new.approved := false;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_media_approval() from public, anon, authenticated;
