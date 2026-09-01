-- Three gaps from the event-type study, all on the voyage row itself.
--
-- Deposit: the booking trigger hardcoded $50 for every deposit_required
-- sailing; multi-day products need real deposits. The figure is now the
-- voyage's own, defaulting to the $50 that has always been true.
--
-- Format: the ten-format catalogue has been live since 20260825 and consulted
-- by rsvp_guard (a_pass_is_required), yet nothing constrained the column and
-- no operator surface set it. The column now answers to the catalogue.
--
-- On-sale hour: the drop mechanic. NULL sale_opens_at is every sailing as it
-- has always been — on sale the moment it exists. A stated hour holds the
-- door until then, and each deeper tier walks in presale_hours earlier
-- (regional at the hour, national one step early, global two).
alter table public.voyages
  add column deposit_cents integer not null default 5000
    check (deposit_cents >= 0 and deposit_cents <= 100000),
  add column sale_opens_at timestamptz,
  add column presale_hours integer not null default 24
    check (presale_hours >= 0 and presale_hours <= 336);

-- voyages.format currently holds no values (verified), so the FK binds clean.
alter table public.voyages
  add constraint voyages_format_speaks_the_catalogue
  foreign key (format) references public.activity_formats(slug)
  on update cascade on delete set null;

-- The booking trigger charges the voyage's own deposit.
do $$
declare
  src text := pg_get_functiondef('public.handle_rsvp_aboard()'::regprocedure);
  anchor text := $a$        if v.deposit_required then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -5000, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;$a$;
begin
  if position(anchor in src) = 0 then
    raise exception 'anchor missing: the hardcoded deposit — read the live function before patching';
  end if;
  src := replace(src, anchor, $a$        if v.deposit_required and v.deposit_cents > 0 then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -v.deposit_cents, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;$a$);
  execute src;
end $$;

-- The gate honours the drop. Staff bypass at the top of rsvp_guard already
-- covers operators; the refusal names the hour in the harbour's own clock.
do $$
declare
  src text := pg_get_functiondef('public.rsvp_guard()'::regprocedure);
  anchor text := $a$  -- Monthly allowance (0 = a la carte, uncapped), counted on each sailing's own$a$;
begin
  if position(anchor in src) = 0 then
    raise exception 'anchor missing: the monthly-allowance comment — read the live function before patching';
  end if;
  src := replace(src, anchor, $a$  -- The drop. A sailing with a stated on-sale hour holds its door until then;
  -- each deeper tier walks in presale_hours earlier. NULL is the old world:
  -- on sale from the moment the sailing exists.
  if v.sale_opens_at is not null then
    opens := v.sale_opens_at - make_interval(hours =>
      (case member.tier when 'regional' then 0 when 'national' then 1 else 2 end) * v.presale_hours);
    if now() < opens then
      raise exception 'the drop opens % for your tier',
        to_char(opens at time zone zone, 'Mon DD, HH24:MI');
    end if;
  end if;

  -- Monthly allowance (0 = a la carte, uncapped), counted on each sailing's own$a$);
  execute src;
end $$;;
