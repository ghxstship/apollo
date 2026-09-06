-- Open Deck lets a member attach any episode that is live or still ahead, and
-- that permission stays: the deck is where an episode gets talked about before
-- it happens, and a rule that only pass-holders may name one would empty the
-- thread that sells it. What was missing is the other half — nothing on the
-- card told a reader whether the person writing about Friday is actually going
-- to be there. The attachment carried the same weight either way.
--
-- So: a marker, and the club works it out rather than the browser. The page
-- cannot compute this for itself — RLS on `passes` shows a member their own
-- rows and nobody else's, which is exactly right and exactly why a client
-- guess would be wrong for every post but your own. A definer answers it for
-- the posts already on the page and nothing else.
--
-- It leaks one bit, about a pairing the author themselves published: this
-- person, that episode, aboard or not. Names no pass, no guest count, no code,
-- and says nothing at all about an episode nobody attached.
create or replace function public.posts_aboard(p_posts uuid[])
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id
    from public.open_deck_posts p
    join public.passes r
      on r.profile_id = p.author_id
     and r.episode_id = p.episode_id
     and r.status = 'aboard'
   where auth.uid() is not null
     and p.id = any(p_posts)
     and p.author_id is not null
     and p.episode_id is not null;
$$;

comment on function public.posts_aboard(uuid[]) is
  'Of these posts, the ones whose author holds a pass on the episode they attached. Server-side truth for the aboard marker on the deck; a member cannot read anyone else''s passes to work it out.';

revoke execute on function public.posts_aboard(uuid[]) from public;
grant execute on function public.posts_aboard(uuid[]) to authenticated;
