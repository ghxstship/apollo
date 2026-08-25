-- Every rate limit in this system guards an UNAUTHENTICATED door:
-- pace_the_applications on applications, application_status_for, and
-- email_may_board. Nothing paces a member writing at another member. messages
-- carries one trigger (a closed-thread check) and wardroom_posts and
-- wardroom_comments carry none at all.
--
-- Two amplifiers make that worse than a bare insert loop. The live thread view
-- refreshes the whole server-rendered page on a 500 ms debounce for every
-- INSERT, so a sustained stream forces a full re-render and re-fetch twice a
-- second in the victim's tab. And /threads selects every message in every
-- thread the reader belongs to, unpaginated, to compute a two-line preview.
--
-- Deliberately NOT what the crawl proposed for wardroom_flags: it reported no
-- unique constraint on (post_id, flagger_id), and one already exists —
-- `one_flag_per_post_per_member`. Checked before building; nothing to add.
--
-- The bounds are set where a person never meets them and a script always does.
-- Twenty posts in ten minutes is a very talkative member; sixty comments is a
-- long argument. Neither is reachable by hand at speed, and both are an order
-- of magnitude under what it takes to make somebody else's feed unusable.
create or replace function public.pace_the_deck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare recent int; ceiling int; who uuid;
begin
  if public.is_staff() then return new; end if;

  if tg_table_name = 'wardroom_posts' then
    who := new.author_id; ceiling := 20;
    select count(*) into recent from public.wardroom_posts
     where author_id = who and created_at > now() - interval '10 minutes';
  elsif tg_table_name = 'wardroom_comments' then
    who := new.author_id; ceiling := 60;
    select count(*) into recent from public.wardroom_comments
     where author_id = who and created_at > now() - interval '10 minutes';
  else
    return new;
  end if;

  if recent >= ceiling then
    raise exception 'that is a lot of words in a short time — give it a few minutes'
      using errcode = '53400';
  end if;
  return new;
end;
$$;

revoke execute on function public.pace_the_deck() from public, anon, authenticated;

drop trigger if exists pace_the_deck on public.wardroom_posts;
create trigger pace_the_deck before insert on public.wardroom_posts
  for each row execute function public.pace_the_deck();

drop trigger if exists pace_the_deck on public.wardroom_comments;
create trigger pace_the_deck before insert on public.wardroom_comments
  for each row execute function public.pace_the_deck();
;
