/* The fifty-two episodes of Season I, Miami — from the owner's 2026-2027
   Master Playbook, Friday 4 September 2026 to Sunday 29 August 2027.

   TIER became experience_class plus duration, because that is what a tier is
   once you stop treating it as a third axis:
     Tier 1 Intimate Salon      -> club,    3 hours
     Tier 2 Elevated Social     -> club,    5 hours
     Tier 3 Immersive Excursion -> exotic,  7 hours  (every one is a drive out
                                                      of the city, which is
                                                      what Exotic means here)
     Tier 4 Grand Expedition    -> premium, 9 hours  (the boat or the room is
                                                      yours)
   Tiers 1 and 2 both land on Club and that is correct: they differ by scale
   and price, which a member reads as capacity and dollars rather than as a
   taxonomy rung. The trigger derives sub_class from the hours.

   PRICE AND CAPACITY WERE NOT INVENTED. The playbook does not carry them, so
   every episode lands at the table defaults with sale_opens_at sixty days out.
   The listing then shows an on-sale date instead of a price, which is the
   truth: announced, not yet on offer. Pricing is a Bridge pass.

   START TIMES ARE INFERRED and should be checked. The playbook gives a day,
   not a clock. Anchor sails at 13:00, Off Soundings at 18:00, Even Keel at
   19:00, Night Watch and Showboat at 20:00 — except any title carrying
   midnight, night, nocturne, noir, moonlit or dusk, which starts at 21:00.

   THREE COPY CORRECTIONS the lexicon gate forced, caught before the insert
   rather than after the build went red. Three titles carried Salon, a banned
   term: Surrealist Salon became After dark in the sculpture garden, Recovery
   Salon became Zenith, Rooftop Boxing Salon became High rhythm. Week 15
   mustered at Miami Harbor, banned since the City rename; it is Government
   Cut, which is that harbour's actual name and the better line anyway.

   EVERY BLURB IS REWRITTEN. The playbook's prose is lush by design — it is a
   pitch document — and these lines are member-facing, where the house voice is
   short, concrete and declarative.

   TWO DERIVATION BUGS were caught by reading the output instead of trusting
   it: the water-word test matched cove inside Recovery and island inside
   Venetian Islands, filing a rooftop helipad and a spa residence as afloat.
   Both are ashore. */

with playbook(slug, title, blurb, series, setting, xclass, starts_at, ends_at, muster, sale_opens_at, week) as (values
  ('s1-w01-anchor-the-launch', 'Anchor: the launch.', 'A hundred feet out of Haulover Inlet, floating lounges off the sandbar. Season I opens with nobody aboard having met.', 'anchor', 'sea', 'premium', '2026-09-05T01:00:00Z', '2026-09-05T10:00:00Z', 'Haulover Inlet / Key Biscayne Sandbar', '2026-07-07T01:00:00Z', 1),
  ('s1-w02-neon-dusk', 'Neon dusk.', 'Rooftop movement as the light goes, then the bar opens. Brickell, seven floors up.', 'even_keel', 'shore', 'club', '2026-09-10T01:00:00Z', '2026-09-10T04:00:00Z', 'Brickell Rooftop Loft', '2026-07-12T01:00:00Z', 2),
  ('s1-w03-airboat-safari', 'Airboat safari.', 'Forty minutes west, then flat water after dark. The marsh lights up on its own.', 'off_soundings', 'sea', 'exotic', '2026-09-20T01:00:00Z', '2026-09-20T08:00:00Z', 'Everglades Edge (West Broward, 40 min drive)', '2026-07-22T01:00:00Z', 3),
  ('s1-w04-velvet-nocturne', 'Velvet nocturne.', 'Scent and spirits in a Coral Gables villa. Two rooms, one door, phones away.', 'night_watch', 'shore', 'club', '2026-09-23T01:00:00Z', '2026-09-23T06:00:00Z', 'Historic Coral Gables Villa', '2026-07-25T01:00:00Z', 4),
  ('s1-w05-shadow-and-silk', 'Shadow and silk.', 'Immersive masquerade at the Paris Theater. You are not in the audience for long.', 'showboat', 'shore', 'club', '2026-10-02T00:00:00Z', '2026-10-02T05:00:00Z', 'Historic Paris Theater, South Beach', '2026-08-03T00:00:00Z', 5),
  ('s1-w06-anchor-autumn-equinox', 'Anchor: autumn equinox.', 'Sunset out of Biscayne and into the Stiltsville waters. The house on legs is the turn.', 'anchor', 'sea', 'premium', '2026-10-11T17:00:00Z', '2026-10-12T02:00:00Z', 'Biscayne National Park / Stiltsville Waters', '2026-08-12T17:00:00Z', 6),
  ('s1-w07-nocturnal-equine', 'Nocturnal equine.', 'Fifty-five minutes to Wellington. Polo under lights, asado after.', 'off_soundings', 'shore', 'exotic', '2026-10-17T01:00:00Z', '2026-10-17T08:00:00Z', 'Wellington Equestrian Center (55 min drive)', '2026-08-18T01:00:00Z', 7),
  ('s1-w08-sound-architecture', 'Sound architecture.', 'A 360-degree spatial bath in the Design District. Lie down and let the room work.', 'even_keel', 'shore', 'club', '2026-10-20T23:00:00Z', '2026-10-21T02:00:00Z', 'Design District Sound Sanctuary', '2026-08-21T23:00:00Z', 8),
  ('s1-w09-after-dark-in-the-sculpture-garden', 'After dark in the sculpture garden.', 'Pinecrest, private, surreal. The statues get stranger the longer you stay.', 'night_watch', 'shore', 'club', '2026-11-01T00:00:00Z', '2026-11-01T05:00:00Z', 'Pinecrest Gardens Private Estate', '2026-09-02T00:00:00Z', 9),
  ('s1-w10-apex-velocity', 'Apex velocity.', 'Homestead-Miami after hours. Exotic metal, an empty track, night.', 'off_soundings', 'shore', 'premium', '2026-11-06T01:00:00Z', '2026-11-06T10:00:00Z', 'Homestead-Miami Speedway (45 min drive)', '2026-09-07T01:00:00Z', 10),
  ('s1-w11-anchor-coastal-solstice', 'Anchor: coastal solstice.', 'A superyacht out of Las Olas and a private stretch of Fort Lauderdale beach.', 'anchor', 'sea', 'premium', '2026-11-15T17:00:00Z', '2026-11-16T02:00:00Z', 'Fort Lauderdale Beach / Las Olas Marina', '2026-09-16T17:00:00Z', 11),
  ('s1-w12-somatic', 'Somatic.', 'Breathwork and movement on a South Beach roof. Bring nothing.', 'even_keel', 'shore', 'club', '2026-11-18T23:00:00Z', '2026-11-19T02:00:00Z', 'South Beach Private Rooftop Studio', '2026-09-19T23:00:00Z', 12),
  ('s1-w13-omakase-underground', 'Omakase underground.', 'Twenty seats, one counter, live jazz. Wynwood, below street.', 'night_watch', 'shore', 'club', '2026-11-29T00:00:00Z', '2026-11-29T05:00:00Z', 'Wynwood Underground Lounge', '2026-09-30T00:00:00Z', 13),
  ('s1-w14-art-basel-the-warehouse-preview', 'Art Basel: the warehouse preview.', 'Little River, before the crowds. What is on the walls is not for sale yet.', 'night_watch', 'shore', 'club', '2026-12-02T00:00:00Z', '2026-12-02T05:00:00Z', 'Little River Studio Complex', '2026-10-03T00:00:00Z', 14),
  ('s1-w15-anchor-winter-solstice', 'Anchor: winter solstice.', 'The bay lit end to end, out of Government Cut and past Star Island.', 'anchor', 'sea', 'premium', '2026-12-12T17:00:00Z', '2026-12-13T02:00:00Z', 'Government Cut / Star Island Waters', '2026-10-13T17:00:00Z', 15),
  ('s1-w16-fire-and-ice', 'Fire and ice.', 'Contrast hydrotherapy on the Key Biscayne lawn. Hot, then very cold, then dinner.', 'even_keel', 'shore', 'club', '2026-12-17T23:00:00Z', '2026-12-18T04:00:00Z', 'Key Biscayne Oceanfront Lawn', '2026-10-18T23:00:00Z', 16),
  ('s1-w17-celestial-noir', 'Celestial noir.', 'Under the dome at Museum Park. Stars, then a symphony.', 'showboat', 'shore', 'club', '2026-12-31T01:00:00Z', '2026-12-31T04:00:00Z', 'Museum Park Dome Venue', '2026-11-01T01:00:00Z', 17),
  ('s1-w18-glow-paddle', 'Glow paddle.', 'Oleta after dark. The mangroves answer the paddle.', 'off_soundings', 'sea', 'club', '2027-01-08T01:00:00Z', '2027-01-08T06:00:00Z', 'Oleta River State Park', '2026-11-09T01:00:00Z', 18),
  ('s1-w19-anchor-new-year-horizon', 'Anchor: new year horizon.', 'Crandon sandbar as a day club. The first one of the year.', 'anchor', 'sea', 'premium', '2027-01-17T17:00:00Z', '2027-01-18T02:00:00Z', 'Key Biscayne Crandon Sandbar', '2026-11-18T17:00:00Z', 19),
  ('s1-w20-dining-in-the-dark', 'Dining in the dark.', 'You will not see the plate or the person. Coconut Grove, one long table.', 'showboat', 'shore', 'club', '2027-01-20T00:00:00Z', '2027-01-20T03:00:00Z', 'Private Coconut Grove Estate', '2026-11-21T00:00:00Z', 20),
  ('s1-w21-zenith', 'Zenith.', 'Combat and recovery on a downtown helipad. Forty floors of nothing underneath.', 'even_keel', 'shore', 'club', '2027-01-23T23:00:00Z', '2027-01-24T04:00:00Z', 'Downtown Miami High-Rise Helipad', '2026-11-24T23:00:00Z', 21),
  ('s1-w22-art-deco-nocturne', 'Art Deco nocturne.', 'The Wolfsonian after hours, and its roof. The city looks older from up there.', 'night_watch', 'shore', 'club', '2027-01-28T01:00:00Z', '2027-01-28T04:00:00Z', 'Wolfsonian-FIU Museum & Private Roof', '2026-11-29T01:00:00Z', 22),
  ('s1-w23-eros-and-illusion', 'Eros and illusion.', 'Cabaret at the Faena. Sit close.', 'showboat', 'shore', 'club', '2027-02-06T00:00:00Z', '2027-02-06T05:00:00Z', 'Faena Theater, Mid-Beach', '2026-12-08T00:00:00Z', 23),
  ('s1-w24-anchor-valentines', 'Anchor: Valentine''s.', 'Fisher Island waters to a private key. Bring someone or find one.', 'anchor', 'sea', 'premium', '2027-02-13T17:00:00Z', '2027-02-14T02:00:00Z', 'Fisher Island Waters / Private Key', '2026-12-15T17:00:00Z', 24),
  ('s1-w25-deep-breath', 'Deep breath.', 'Cold plunge on the Venetian Islands. The hard part is the first minute.', 'even_keel', 'shore', 'club', '2027-02-17T23:00:00Z', '2027-02-18T02:00:00Z', 'Venetian Islands Private Spa Residence', '2026-12-19T23:00:00Z', 25),
  ('s1-w26-coastal-rally', 'Coastal rally.', 'Miami to Boca on A1A, in convoy. Fifty minutes of coast.', 'off_soundings', 'shore', 'exotic', '2027-02-28T22:00:00Z', '2027-03-01T05:00:00Z', 'A1A Coastal Drive from Miami to Boca Raton (50 min drive)', '2026-12-30T22:00:00Z', 26),
  ('s1-w27-botanical-illumination', 'Botanical illumination.', 'Fairchild after dark. The orchid house is lit from inside.', 'night_watch', 'shore', 'club', '2027-03-05T01:00:00Z', '2027-03-05T06:00:00Z', 'Fairchild Tropical Botanic Garden', '2027-01-04T01:00:00Z', 27),
  ('s1-w28-anchor-spring-equinox', 'Anchor: spring equinox.', 'Two catamarans off Fowey Rocks, trampolines strung between them.', 'anchor', 'sea', 'premium', '2027-03-14T17:00:00Z', '2027-03-15T02:00:00Z', 'Key Biscayne / Fowey Rocks', '2027-01-13T17:00:00Z', 28),
  ('s1-w29-high-rhythm', 'High rhythm.', 'TRX and boxing on a Wynwood roof. Live percussion, no mirrors.', 'even_keel', 'shore', 'club', '2027-03-16T23:00:00Z', '2027-03-17T02:00:00Z', 'Wynwood Fitness Loft Roof', '2027-01-15T23:00:00Z', 29),
  ('s1-w30-night-angling', 'Night angling.', 'Offshore out of Fort Lauderdale under floodlights. The chef meets the boat.', 'off_soundings', 'sea', 'exotic', '2027-03-28T01:00:00Z', '2027-03-28T08:00:00Z', 'Fort Lauderdale Offshore Waters (35 min drive)', '2027-01-27T01:00:00Z', 30),
  ('s1-w31-alchemy-of-scent', 'Alchemy of scent.', 'Build your own in a Design District atelier. Oud, amber, vanilla.', 'night_watch', 'shore', 'club', '2027-04-08T00:00:00Z', '2027-04-08T03:00:00Z', 'Design District Atelier', '2027-02-07T00:00:00Z', 31),
  ('s1-w32-anchor-spring-breeze', 'Anchor: spring breeze.', 'A sailing catamaran across Biscayne to a private cove off Virginia Key.', 'anchor', 'sea', 'premium', '2027-04-17T17:00:00Z', '2027-04-18T02:00:00Z', 'Biscayne Bay / Virginia Key Cove', '2027-02-16T17:00:00Z', 32),
  ('s1-w33-sacred-sound', 'Sacred sound.', 'Kundalini and gongs in a Coconut Grove garden, copal burning.', 'even_keel', 'shore', 'club', '2027-04-20T23:00:00Z', '2027-04-21T02:00:00Z', 'Coconut Grove Zen Estate', '2027-02-19T23:00:00Z', 33),
  ('s1-w34-fire-in-the-sky', 'Fire in the sky.', 'Parasailing off Fort Lauderdale at twilight, bonfire on landing.', 'off_soundings', 'sea', 'club', '2027-04-24T01:00:00Z', '2027-04-24T06:00:00Z', 'Fort Lauderdale Beach (30 min drive)', '2027-02-23T01:00:00Z', 34),
  ('s1-w35-secret-cinema', 'Secret cinema.', 'Rooftop silent disco, one classic thriller, wireless headphones. Edgewater.', 'showboat', 'shore', 'club', '2027-04-30T01:00:00Z', '2027-04-30T04:00:00Z', 'Edgewater Penthouse Terrace', '2027-03-01T01:00:00Z', 35),
  ('s1-w36-cacao-ceremony', 'Cacao ceremony.', 'Ecstatic dance barefoot in an Upper Eastside garden. Live djembes.', 'even_keel', 'shore', 'club', '2027-05-04T23:00:00Z', '2027-05-05T02:00:00Z', 'Upper Eastside Private Garden', '2027-03-05T23:00:00Z', 36),
  ('s1-w37-anchor-the-white-party', 'Anchor: the white party.', 'All white, lasers over water, an international booth. Out of South Pointe.', 'anchor', 'sea', 'premium', '2027-05-16T01:00:00Z', '2027-05-16T10:00:00Z', 'Miami Beach Marina / South Pointe', '2027-03-17T01:00:00Z', 37),
  ('s1-w38-offshore-thrill', 'Offshore thrill.', 'Cigarette boats across the bay to a private picnic island.', 'off_soundings', 'sea', 'club', '2027-05-20T22:00:00Z', '2027-05-21T03:00:00Z', 'Biscayne Bay / Pace Picnic Island', '2027-03-21T22:00:00Z', 38),
  ('s1-w39-opera-in-the-monastery', 'Opera in the monastery.', 'Twelfth-century cloisters in North Miami, sung late, by candle.', 'night_watch', 'shore', 'exotic', '2027-05-31T00:00:00Z', '2027-05-31T07:00:00Z', 'Ancient Spanish Monastery, North Miami (25 min drive)', '2027-04-01T00:00:00Z', 39),
  ('s1-w40-liquid-zen', 'Liquid zen.', 'Watsu in ninety-eight-degree water in Coral Gables. Weightless for an hour.', 'even_keel', 'shore', 'club', '2027-06-02T23:00:00Z', '2027-06-03T04:00:00Z', 'Coral Gables Private Heated Pool Estate', '2027-04-03T23:00:00Z', 40),
  ('s1-w41-anchor-midsummer-solstice', 'Anchor: midsummer solstice.', 'Twin yachts on the Haulover sandbar with floating docks between them.', 'anchor', 'sea', 'premium', '2027-06-13T17:00:00Z', '2027-06-14T02:00:00Z', 'Haulover Sandbar', '2027-04-14T17:00:00Z', 41),
  ('s1-w42-speakeasy-takeover', 'Speakeasy takeover.', 'Stand-up, then Latin jazz, in a room off Calle Ocho you will not find twice.', 'showboat', 'shore', 'club', '2027-06-19T00:00:00Z', '2027-06-19T03:00:00Z', 'Secret Calle Ocho Underground Room', '2027-04-20T00:00:00Z', 42),
  ('s1-w43-sound-sanctuary', 'Sound sanctuary.', 'Superblue after hours. Mirror mazes, spatial sound, nobody else in the building.', 'night_watch', 'shore', 'club', '2027-06-30T00:00:00Z', '2027-06-30T05:00:00Z', 'Superblue Immersive Art Space', '2027-05-01T00:00:00Z', 43),
  ('s1-w44-twilight-from-the-air', 'Twilight from the air.', 'Helicopter out of Fort Lauderdale, down onto a Brickell rooftop.', 'off_soundings', 'shore', 'exotic', '2027-07-03T22:00:00Z', '2027-07-04T05:00:00Z', 'Fort Lauderdale Executive Airport to Brickell (35 min drive)', '2027-05-04T22:00:00Z', 44),
  ('s1-w45-moonlit-on-the-sand', 'Moonlit on the sand.', 'Yoga and singing bowls at mid-beach. Coconut water from the shell.', 'even_keel', 'shore', 'club', '2027-07-09T01:00:00Z', '2027-07-09T04:00:00Z', 'Mid-Beach Private Oceanfront Area', '2027-05-10T01:00:00Z', 45),
  ('s1-w46-anchor-high-summer', 'Anchor: high summer.', 'Seabobs off the Key Biscayne lighthouse. Afro-house and grilled lobster.', 'anchor', 'sea', 'premium', '2027-07-18T17:00:00Z', '2027-07-19T02:00:00Z', 'Key Biscayne Lighthouse Waters', '2027-05-19T17:00:00Z', 46),
  ('s1-w47-flamenco-and-rioja', 'Flamenco and Rioja.', 'A Coconut Grove courtyard, guitar, castanets, aged red.', 'night_watch', 'shore', 'club', '2027-07-21T00:00:00Z', '2027-07-21T05:00:00Z', 'Coconut Grove Historic Courtyard', '2027-05-22T00:00:00Z', 47),
  ('s1-w48-havana-nights', 'Havana nights.', 'Hand-rolled cigars and rum aged twelve to twenty-five years. A Little Havana roof.', 'showboat', 'shore', 'club', '2027-07-31T01:00:00Z', '2027-07-31T04:00:00Z', 'Little Havana Private Rooftop Speakeasy', '2027-06-01T01:00:00Z', 48),
  ('s1-w49-hydrofoil-clinic', 'Hydrofoil clinic.', 'eFoils on the Marine Stadium basin. You will fall, then you will fly.', 'even_keel', 'sea', 'club', '2027-08-04T23:00:00Z', '2027-08-05T04:00:00Z', 'Miami Marine Stadium Basin', '2027-06-05T23:00:00Z', 49),
  ('s1-w50-anchor-the-season-finale', 'Anchor: the season finale.', 'A hundred and twenty feet on Biscayne Bay, skyline lit, caviar and violin.', 'anchor', 'sea', 'premium', '2027-08-15T17:00:00Z', '2027-08-16T02:00:00Z', 'Biscayne Bay / Downtown Skyline Waters', '2027-06-16T17:00:00Z', 50),
  ('s1-w51-nocturnal-sculpture', 'Nocturnal sculpture.', 'A late viewing in a Wynwood garden, with botanical cocktails.', 'night_watch', 'shore', 'club', '2027-08-20T01:00:00Z', '2027-08-20T04:00:00Z', 'Wynwood Private Sculpture Garden', '2027-06-21T01:00:00Z', 51),
  ('s1-w52-the-grand-masquerade', 'The grand masquerade.', 'Black and gold in a waterfront Fort Lauderdale estate. Season II is announced at midnight.', 'showboat', 'shore', 'exotic', '2027-08-29T00:00:00Z', '2027-08-29T07:00:00Z', 'Historic Needham Estate, Fort Lauderdale (35 min drive)', '2027-06-30T00:00:00Z', 52)
)
insert into public.episodes
  (slug, title, blurb, series, setting, experience_class, starts_at, ends_at,
   muster, sale_opens_at, time_zone, city_id, season_id, edition_id, status, media)
select
  p.slug, p.title, p.blurb, p.series, p.setting::public.setting, p.xclass,
  p.starts_at::timestamptz, p.ends_at::timestamptz, p.muster, p.sale_opens_at::timestamptz,
  'America/New_York', c.id, s.id, ed.id, 'scheduled'::public.episode_status,
  case when p.setting = 'sea' then 'day' else 'dusk' end
from playbook p
cross join public.cities c
cross join public.seasons s
left join public.editions ed on ed.series = p.series and ed.city_id = c.id
where c.slug = 'miami' and s.slug = 's1-miami'
on conflict (slug) do update set
  title = excluded.title, blurb = excluded.blurb, series = excluded.series,
  setting = excluded.setting, experience_class = excluded.experience_class,
  starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  muster = excluded.muster, sale_opens_at = excluded.sale_opens_at,
  city_id = excluded.city_id, season_id = excluded.season_id,
  edition_id = excluded.edition_id;;
