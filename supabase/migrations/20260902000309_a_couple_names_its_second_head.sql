-- DECISION: a couple pass is one row and two heads, and the second head had no
-- record — no code, no waiver, no camera consent. The second head is now a
-- rsvp_guests row of kind 'partner': it rides the guest machinery for its
-- code, its sign token and its consent, is allowed on any tier and on ratio
-- sailings (it is the pass's own second head, not a companion), never counts
-- as a guest, and is never pruned by a guest-name edit.
alter table public.rsvp_guests add column if not exists kind text not null default 'guest'
  check (kind in ('guest','partner'));
create unique index if not exists rsvp_guests_one_partner_per_pass
  on public.rsvp_guests (rsvp_id) where kind = 'partner';

do $$
declare src text; a text;
begin
  src := pg_get_functiondef('public.guard_guest_row()'::regprocedure);
  a := $a$  if v_tier is distinct from 'global' then
    raise exception 'guest passes ride on Global memberships';
  end if;

  select count(*) into v_seated from public.rsvp_guests g where g.rsvp_id = new.rsvp_id;
  if v_seated >= 2 then raise exception 'two guest passes per member'; end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: guest rules'; end if;
  src := replace(src, a, $a$  if new.kind = 'partner' then
    -- The pass's own second head: only on a couple pass, and only one.
    if not exists (select 1 from public.rsvps r where r.id = new.rsvp_id and r.segment = 'couple') then
      raise exception 'a partner rides a couple pass — this pass seats one';
    end if;
  else
    if v_tier is distinct from 'global' then
      raise exception 'guest passes ride on Global memberships';
    end if;
    select count(*) into v_seated from public.rsvp_guests g where g.rsvp_id = new.rsvp_id and g.kind = 'guest';
    if v_seated >= 2 then raise exception 'two guest passes per member'; end if;
  end if;$a$);
  execute src;

  src := pg_get_functiondef('public.sync_guest_rows()'::regprocedure);
  a := $a$  where g.rsvp_id = new.id
    and g.name <> all(coalesce(new.guest_names, '{}'))$a$;
  if position(a in src) = 0 then raise exception 'anchor: prune'; end if;
  src := replace(src, a, $a$  where g.rsvp_id = new.id
    and g.kind = 'guest'
    and g.name <> all(coalesce(new.guest_names, '{}'))$a$);
  execute src;
end $$;;
