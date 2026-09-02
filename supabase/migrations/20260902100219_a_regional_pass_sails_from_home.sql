/* A Regional pass sails from home (decided 2026-09-02).

   The membership page has always said it — Regional: "your home harbor";
   National: "all US harbors"; Global: "every harbor worldwide" — and the
   guard never did. rsvp_guard gated on tier depth alone, so a Regional member
   in Miami could board a Los Angeles sailing at Regional dues. No reciprocity
   at Regional: the tier ladder is the upsell, and National already answers
   the away case at a price.

   Two edges the rule states rather than guesses: a Regional member with no
   home harbor is told to set one (a null harbor is not a passport), and a
   sailing that names no harbor is a sailing anyone can take (the fixture
   sailings and the odd one-off carry none). Staff bypass the guard entirely,
   as before, and a pass already held is never re-judged on edit.

   Patched in place by anchor, as every rsvp_guard change since W8: the
   function is long, the corpus replays, and a full re-CREATE would silently
   drop whichever later patch this one had not seen. */
do $$
declare
  src text := pg_get_functiondef('public.rsvp_guard()'::regprocedure);
  a text;
begin
  a := $a$    if tier_rank < min_rank then
      raise exception 'passes for this sailing open at % tier', v.min_tier;
    end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: min tier'; end if;
  src := replace(src, a, $a$    if tier_rank < min_rank then
      raise exception 'passes for this sailing open at % tier', v.min_tier;
    end if;
    -- A Regional pass sails from home. No reciprocity at Regional: the tier
    -- ladder is the upsell, and National answers the away case.
    if member.tier = 'regional' and v.harbor_id is not null then
      if member.home_harbor is null then
        raise exception 'Regional passes sail from your home harbor — choose it on your page first';
      elsif member.home_harbor <> v.harbor_id then
        raise exception 'Regional passes sail from your home harbor — this one leaves from %. National sails every US harbor',
          coalesce((select h.name from public.harbors h where h.id = v.harbor_id), 'another harbor');
      end if;
    end if;$a$);
  execute src;
end $$;;
