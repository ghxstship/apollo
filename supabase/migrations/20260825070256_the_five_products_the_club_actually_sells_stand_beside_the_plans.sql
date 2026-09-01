/* The five products operations.md §3 sells, written down beside — never over —
   the thirteen membership_plans that are already here.

   The membership kit carries THREE product economies on one artboard: a tier
   ladder (Coastal $90/yr · Offshore $240/yr · Deepwater invite), a pass list
   (Season · Table $45 · Day Guest $180 · +1 $30), and a table headed "Four
   products, one pass each" with five rows in it. Only the third matches
   operations.md, which is declared canonical on operations. The live app has a
   fourth: thirteen membership_plans on a plan_type × tier grid carrying an
   allowance, a class ceiling, a booking-window head start and Stripe wiring —
   structurally richer than any of the kit's three ladders, and on an axis none
   of them share.

   Nothing reconciles them, so nothing here pretends to. This table is the
   operations.md five. `membership_plans` is untouched: thirteen rows, the same
   thirteen, and every function that reads them still reads them. The join
   between the two economies is one nullable column (`product_slug`, below) that
   is currently null on all thirteen — the mapping is REPRESENTABLE and is not
   ASSERTED, because asserting it is a product decision about fourteen live
   members and it is not one an implementer gets to make.

   Not to be confused with `products`, which is the Shop's merch catalogue. */
create table public.club_products (
  slug text primary key,
  label text not null,
  blurb text not null,
  /* Null is a real answer here and means "never published", not "free". */
  price_cents integer check (price_cents is null or price_cents >= 0),
  published boolean not null default true,
  /* What the money buys: one sailing (`pass`), a standing membership
     (`membership`), or something bolted onto a pass someone already holds
     (`upgrade`). The daybed is an upgrade and not a format — it consumes no
     place on the water, which is why it is here and not in activity_formats. */
  kind text not null check (kind in ('pass', 'membership', 'upgrade')),
  /* What ONE of these consumes of a sailing's composition. Two numbers because
     the kit's own capacity panel mixes denominations and is right to: singles
     are counted in heads, couples in units, and the headline total in heads.
     A couple pass is one unit and two heads — that is the whole reason it is
     not simply two singles.

     These are the PRODUCT's denomination. The per-sailing caps that consume
     them are a sailing's business and live with the ratio gate; putting a cap
     in this table would be a second place to edit the number, and the two
     would disagree within a season. */
  ratio_units smallint not null default 1 check (ratio_units >= 0),
  ratio_heads smallint not null default 1 check (ratio_heads >= 0),
  /* Concurrent holders club-wide. operations.md §3 caps the quarterly
     membership at 20 active and caps nothing else; it is the only cap in the
     document with no apollo counterpart. */
  active_cap integer check (active_cap is null or active_cap > 0),
  vetting text not null,
  includes text[] not null default '{}',
  position smallint not null default 0,
  active boolean not null default true,
  /* "Prices are the product, not a starting point" and "Captain's Pass is the
     only tier that never publishes a number". As a constraint that means: a
     published product carries a price, and an unpublished one carries none.
     Without it, `price_cents = 0` and "invite only" are the same row, and every
     sales surface reading price_cents renders the house's own guest as free. */
  constraint an_unpublished_product_never_carries_a_number
    check (published = (price_cents is not null))
);

alter table public.club_products enable row level security;

create policy "products are anon-readable" on public.club_products
  for select to anon using (active);
create policy "cast and crew read products" on public.club_products
  for select to authenticated using (active or public.is_staff());
create policy "staff keep products" on public.club_products
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

revoke insert, update, delete on public.club_products from anon;

insert into public.club_products
  (slug, label, blurb, price_cents, published, kind, ratio_units, ratio_heads, active_cap, vetting, includes, position)
values
  ('single_pass', 'Single pass',
   'One sailing, one place. The sandbar, the open bar, and the day.',
   35000, true, 'pass', 1, 1, null, 'Vetted',
   array['Sailing and sandbar', 'Premium open bar', 'Challenge entry', 'Radar for the sailing'], 1),
  ('couple_pass', 'Couple pass',
   'Two seats bought as one. Counted as one unit, and that is the point.',
   65000, true, 'pass', 1, 2, null, 'Couple vetting',
   array['Sailing for two', 'Open bar', 'Lounge access', 'Radar as one pin'], 2),
  ('quarterly_membership', 'Quarterly membership',
   'A standing place for the quarter, and a background check that moves faster.',
   250000, true, 'membership', 1, 1, 20, 'Background check and video interview',
   array['Priority access to four sailings', 'Fast-track background check', 'Daybed priority', 'One guest pass'], 3),
  ('vip_daybed', 'Bow daybed',
   'The front of the boat for four, all sailing. Everyone in the group already holds an approved pass.',
   150000, true, 'upgrade', 0, 0, null, 'All four must already hold approved passes',
   array['Reserved bow daybed for four', 'Dedicated steward', 'Bottle service upgrade', 'Priority Confessional Pod slot'], 4),
  /* The number is not withheld pending a decision; there is no number. The
     constraint above is what makes that statement storable. */
  ('captains_pass', 'Captain''s pass',
   'A standing place on the manifest, as a guest of the house.',
   null, false, 'membership', 0, 1, null, 'Invitation only',
   array['Full season', 'Standing manifest place'], 5);

/* The join to the economy that exists, left empty on purpose. A plan that names
   a product is a plan that has been decided; all thirteen are null, so nothing
   has been decided by this migration. */
alter table public.membership_plans
  add column product_slug text references public.club_products(slug);

/* And the same "never published" problem one level down: price_cents is NOT
   NULL on membership_plans, so an invitation-only plan can only be written as
   $0. This does not change any of the thirteen — they are all published — it
   makes the other case sayable. */
alter table public.membership_plans
  add column published boolean not null default true;
;
