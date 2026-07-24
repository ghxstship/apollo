-- Add-ons (tickets kit)
insert into public.addons (slug, name, price_cents) values
  ('wool-layer', 'Wool layer rental', 1200),
  ('galley-breakfast', 'Galley breakfast', 1800),
  ('provisions-crate', 'Provisions crate ashore', 4500);

-- Rewards (portal kit)
insert into public.rewards (name, detail, cost_fm, position) values
  ('First call on scarce berths', 'Your RSVP window opens before the manifest does.', 250, 1),
  ('Guest berth, any salon', 'Bring one ashore, on the club.', 400, 2),
  ('The crossing draw', 'One name drawn each season for the annual crossing.', 1000, 3);

-- Galley catalog (POS kit)
insert into public.galley_items (category, name, price_cents) values
  ('bar', 'Cold one, deck-safe', 700),
  ('bar', 'Salt-rim paloma', 1200),
  ('bar', 'Sparkling water', 400),
  ('galley', 'Galley breakfast', 1800),
  ('galley', 'Long-table lunch plate', 2200),
  ('galley', 'Citrus & cold seafood', 2600),
  ('merch', 'Club cap', 3200),
  ('merch', 'Deck towel', 2400);

-- The Chandlery (shop kit)
insert into public.products (slug, name, category, price_cents, sizes, badge) values
  ('deck-knife', 'Rigging knife', 'deck', 6400, '{}', null),
  ('dry-bag', 'Twenty-liter dry bag', 'deck', 4800, '{}', null),
  ('club-line', 'Dock line, club-spliced', 'deck', 3600, '{}', 'Season II'),
  ('galley-mug', 'Enamel galley mug', 'galley', 2200, '{}', null),
  ('salt-kit', 'Flake salt of the crossing', 'galley', 1800, '{}', null),
  ('wool-jumper', 'Watch-keeper wool jumper', 'wardrobe', 14500, '{XS,S,M,L,XL}', 'Members favorite'),
  ('deck-tee', 'Deck tee, bone', 'wardrobe', 4200, '{XS,S,M,L,XL}', null),
  ('harbor-jacket', 'Harbor shell jacket', 'wardrobe', 22000, '{S,M,L,XL}', null);

-- Crew roles (careers -> ATS)
insert into public.crew_roles (title, port, meta, blurb, position) values
  ('Deckhand', 'Miami', 'FULL TIME · GOVERNMENT CUT', 'Lines, sails, gangway. You teach members the water without making it a lecture.', 1),
  ('Salon lead', 'Los Angeles', 'PART TIME · EVENINGS', 'Long tables, low light. You run the room and the room never knows it.', 2),
  ('Harbormaster ops', 'Miami', 'FULL TIME · SHORE OFFICE', 'Manifests, weather calls, refunds. Calm hands on the ops console.', 3),
  ('Purser engineering', 'Remote', 'FULL TIME · REMOTE', 'You build the agent that answers before the shore office wakes.', 4);

-- Ops fields on seeded voyages
update public.voyages set muster = 'Gangway B-12', deposit_required = true
  where slug in ('night-passage-catalina', 'gulf-stream-run');
update public.voyages set muster = 'Gangway B-12' where muster is null and kind = 'voyage';
update public.voyages set conditions = '{"wind":"12 KN SW","swell":"2 FT","heading":"214°","speed":"7.8 KN"}'
  where slug = 'the-wardroom-sessions';

-- Demo skipper becomes staff and gets an invite code to hand out
update public.profiles set is_staff = true where email = 'skipper@lyre.social';
insert into public.member_roll (email, tier, source)
  values ('skipper@lyre.social', 'global', 'founder') on conflict do nothing;
insert into public.invites (code, inviter_id, max_uses)
select 'THEO-MMXXVI', id, 3 from public.profiles where email = 'skipper@lyre.social'
on conflict do nothing;
update public.profiles set tier = 'global' where email = 'skipper@lyre.social';

-- Provision the owner: julian.clarkson@ghxstship.pro as Global staff
do $$
declare uid uuid := gen_random_uuid();
begin
  insert into public.member_roll (email, tier, source) values ('julian.clarkson@ghxstship.pro', 'global', 'founder')
  on conflict do nothing;
  if not exists (select 1 from auth.users where email = 'julian.clarkson@ghxstship.pro') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'julian.clarkson@ghxstship.pro', crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Julian Clarkson"}', now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', 'julian.clarkson@ghxstship.pro', 'email_verified', true),
      'email', now(), now(), now());
    update public.profiles set is_staff = true, tier = 'global' where id = uid;
  end if;
end $$;
