-- Decision 4. Does a member held for dues keep the roster?
--
-- Yes to the directory, no to the forward manifest.
--
-- The hold copy names booking, posting and contests. Every one of those is an
-- action. Reading the roster is not an action against the club: it is the
-- membership's own fabric, and a substantial part of what a lapsed member is
-- deciding whether to come back to. The club has already bounded this state
-- from both ends — a hold lands only after twenty-one days of grace and runs
-- to ninety days a year — so a paused member is in a defined, temporary
-- position with a route back, not a slow exit. Closing the community during
-- exactly the window you want them to settle in works against the outcome.
--
-- Who is aboard a FUTURE episode is different. It is booking-adjacent, it is
-- other members' whereabouts, and it is information a held member cannot act
-- on because booking is the thing that closed. It should follow the booking
-- right, and it does now.
--
-- Departed stays closed everywhere, which viewer_may_browse() already does.
-- This is the narrower question of what a hold means, answered one way for the
-- directory and the other for the manifest.
do $surgery$
declare src text; anchor text := 'if not public.viewer_may_browse() then';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'episode_manifest';
  if src is null then raise exception 'episode_manifest is gone'; end if;
  if position(anchor in src) = 0 then
    raise exception 'episode_manifest no longer opens with the browse check — look before patching';
  end if;
  src := replace(src, anchor, 'if not public.is_active() then');
  src := replace(src, '''sign in first''', '''booking is closed while dues are outstanding, and so is the manifest''');
  execute src;
end $surgery$;

comment on function public.episode_manifest(uuid) is
  'Who is aboard. Gated on is_active(), not merely on being signed in: the manifest is booking-adjacent, and a hold that closes booking closes this with it. The directory is gated on viewer_may_browse() instead, which admits a held member and refuses a departed one.';
