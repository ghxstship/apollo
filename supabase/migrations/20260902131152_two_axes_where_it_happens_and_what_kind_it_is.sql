/* Two axes, because there were always two facts (decided 2026-09-02).

   activity_formats.category held sea | port | premium, which is not one axis:
   sea and port say WHERE a thing happens, premium says HOW FAR THE CLUB GOES
   for it. Tangling them is why nothing could file a pool social — and why a
   private charter, which is very much afloat, was filed as neither sea nor
   port.

   So: category keeps the where and is corrected to hold only sea | port, and a
   new experience_class holds open | club | premium | exotic. A format is now
   free to be afloat AND premium (private charter), or ashore AND premium
   (gathering), which the old column could not express.

   The four classes, and what puts a format in one:
     open      a member's guest who has not been vetted may come. The
               low-commitment door, and the only one that is.
     club      the members' standard — the anchor sailing and its kin.
     premium   the club goes further: the boat, or the room, is yours.
     exotic    the club leaves home water. Blue water and foreign harbours;
               PMI and IBZ have been in the harbour codes since the rebrand
               waiting for a class to hang on.

   voyages.class (sea | shore) is untouched and keeps doing the where — the
   waiver gate, the dating tables, the calendar feed and four views all read
   it. Only its LABELS change, from Sea Day / Port Day to afloat / ashore. */

-- ── formats: the where, corrected ────────────────────────────────────────────
update public.activity_formats set category = 'sea'  where slug = 'private_charter';
update public.activity_formats set category = 'port' where slug = 'gathering';

alter table public.activity_formats drop constraint if exists activity_formats_category_check;
alter table public.activity_formats
  add constraint activity_formats_category_check check (category in ('sea', 'port'));

comment on column public.activity_formats.category is
  'Where it happens: sea (afloat) or port (ashore). What kind it is lives in experience_class.';

-- ── formats: the what kind ───────────────────────────────────────────────────
alter table public.activity_formats
  add column if not exists experience_class text;

update public.activity_formats set experience_class = case slug
  when 'sandbar'         then 'club'
  when 'water_sports'    then 'club'
  when 'theme_voyage'    then 'club'
  when 'crossing'        then 'exotic'
  when 'private_charter' then 'premium'
  when 'gathering'       then 'premium'
  else 'open'
end where experience_class is null;

alter table public.activity_formats alter column experience_class set not null;
alter table public.activity_formats drop constraint if exists activity_formats_experience_class_check;
alter table public.activity_formats
  add constraint activity_formats_experience_class_check
    check (experience_class in ('open', 'club', 'premium', 'exotic'));

comment on column public.activity_formats.experience_class is
  'open = an unvetted guest may come · club = the members standard · premium = the boat or the room is yours · exotic = away from home water';

-- ── the access mode stops echoing the class ──────────────────────────────────
/* 'open' was an access mode and is now an experience class. Two constraints
   name it: the enum list, and the pricing rule that says a format states its
   price exactly when it is open to buy. That rule is unchanged in meaning and
   reads better in the new word — a bookable format publishes a price. The
   guard only ever tests 'invite' and 'on_request', so nothing else moves. */
alter table public.activity_formats drop constraint if exists a_format_publishes_a_price_exactly_when_it_is_open_to_buy;
alter table public.activity_formats drop constraint if exists activity_formats_access_check;

update public.activity_formats set access = 'bookable' where access = 'open';

alter table public.activity_formats
  add constraint activity_formats_access_check
    check (access in ('bookable', 'included', 'seasonal', 'invite', 'on_request'));

alter table public.activity_formats
  add constraint a_format_publishes_a_price_exactly_when_it_is_bookable
    check ((access = 'bookable') = (price_cents is not null));

-- ── sailings carry the class their format states ─────────────────────────────
alter table public.voyages
  add column if not exists experience_class text;

update public.voyages v set experience_class = coalesce(
  (select f.experience_class from public.activity_formats f where f.slug = v.format),
  case when v.class = 'sea' then 'club' else 'open' end
) where v.experience_class is null;

alter table public.voyages alter column experience_class set not null;
alter table public.voyages drop constraint if exists voyages_experience_class_check;
alter table public.voyages
  add constraint voyages_experience_class_check
    check (experience_class in ('open', 'club', 'premium', 'exotic'));

create index if not exists voyages_experience_class_idx on public.voyages (experience_class);

-- ── one ladder, whatever is under the keel ───────────────────────────────────
/* trek, excursion and overland were admitted by the CHECK and known to nothing
   else: the brand constants define three sub-classes, the Bridge composer
   builds its picker from those three, and rsvp_guard ranks those three — so a
   sailing filed as a trek skipped the class ceiling entirely. Duration is
   duration whether or not there is water under it. */
alter table public.voyages drop constraint if exists voyages_sub_class_check;
alter table public.voyages
  add constraint voyages_sub_class_check
    check (sub_class = any (array['voyage'::text, 'expedition'::text, 'odyssey'::text]));

-- ── the Captain's Pass is not a product ──────────────────────────────────────
/* It carried two conflicting definitions — the handbook's "issued digital
   ticket" and this row's invitation-only standing place — and one of them
   leaned on a banned word. Membership is reached by invitation or by
   application, both of which are real objects with real tables. What a member
   buys for one sailing is a boarding pass. */
do $$
begin
  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products disable trigger zz_record_the_change';
  end if;

  update public.club_products set active = false, published = false where slug = 'captains_pass';

  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products enable trigger zz_record_the_change';
  end if;
end $$;;
