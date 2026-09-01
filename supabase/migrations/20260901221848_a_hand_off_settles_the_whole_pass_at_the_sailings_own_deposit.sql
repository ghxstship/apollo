-- accept_pass_transfer's settlement cap still said 5000 for the deposit after
-- the deposit became the sailing's own figure, and it never counted the two
-- new things a pass can carry — a bow daybed and a cabin premium — so a
-- receiver was undercharged and a giver under-credited by exactly those
-- amounts. The cap now reads the voyage's deposit and adds what the pass holds.
do $$
declare
  src text := pg_get_functiondef('public.accept_pass_transfer(uuid)'::regprocedure);
  a1 text := $a$       + (case when v.deposit_required then 5000 else 0 end)$a$;
  a2 text := $a$         ), 0)
    into cap;$a$;
begin
  if position(a1 in src) = 0 then raise exception 'anchor missing: the 5000 deposit in the cap'; end if;
  if position(a2 in src) = 0 then raise exception 'anchor missing: the cap close'; end if;
  src := replace(src, a1, $a$       + (case when v.deposit_required then v.deposit_cents else 0 end)$a$);
  src := replace(src, a2, $a$         ), 0)
       + coalesce((select cp.price_cents from public.voyage_daybeds vd
                   join public.club_products cp on cp.slug = 'vip_daybed'
                   where vd.rsvp_id = t.rsvp_id limit 1), 0)
       + coalesce((select c.premium_cents from public.rsvps r2
                   join public.cabins c on c.id = r2.cabin_id
                   where r2.id = t.rsvp_id), 0)
    into cap;$a$);
  execute src;
end $$;;
