-- A SIGNED URL CANNOT BE REVOKED. It is a capability: a token over a path and
-- an expiry, checked without consulting any policy. So `approved = false` —
-- which is how a member takes their own frame back off the water, and how the
-- Bridge pulls one for consent — removed the frame from the gallery and did
-- nothing whatsoever to links already minted.
--
-- Verified end to end by the crawl: mint a URL with expiresIn 315360000, get a
-- token expiring in 2036, un-approve the frame, fetch again — 200. Only
-- deleting the object returned 400. And because `approved frames are public`
-- lets anon read voyage_media including storage_path, and `approved frames can
-- be signed` lets anon sign any approved path, anybody holding the public key
-- can systematically pre-mint decade-long URLs for the whole gallery and keep
-- them after every withdrawal.
--
-- The crawl's suggested fix — drop anon from the storage policy and let the
-- server mint — does not work here, and it is worth writing down why so nobody
-- tries it twice: /gallery is a PUBLIC route, framesFor() signs server-side
-- through the ordinary SSR client, and for an anonymous visitor that client
-- carries the anon key. Anon signing IS the gallery. Removing it removes the
-- gallery.
--
-- What can be fixed is the withdrawal. A signed URL names a PATH, so moving the
-- object breaks every link ever minted for it, retroactively and without
-- needing to know they exist. Withdrawal now moves the file under `withdrawn/`
-- and repoints the record, which keeps the frame — this is a consent action,
-- not a moderation delete, and destroying a member's photograph because they
-- asked to be taken out of the gallery would be its own failure.
--
-- Fires after guard_media_approval, which is what the name buys: `withdrawn_`
-- sorts after `guard_`, and same-timing triggers run in name order. The guard
-- gets to reject a member moving their own path before this legitimately moves
-- it for them.
create or replace function public.withdrawn_frames_leave_their_path()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare moved text;
begin
  if coalesce(old.approved, false) and not coalesce(new.approved, false)
     and new.storage_path is not null
     and new.storage_path = old.storage_path
     and new.storage_path not like 'withdrawn/%'
  then
    moved := 'withdrawn/' || new.id::text || '/' || new.storage_path;
    update storage.objects
       set name = moved
     where bucket_id = 'voyage-media' and name = old.storage_path;
    -- Only follow the file if the file actually moved.
    if found then
      new.storage_path := moved;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.withdrawn_frames_leave_their_path() from public, anon, authenticated;

drop trigger if exists withdrawn_frames_leave_their_path on public.voyage_media;
create trigger withdrawn_frames_leave_their_path
  before update of approved on public.voyage_media
  for each row execute function public.withdrawn_frames_leave_their_path();
;
