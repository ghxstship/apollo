-- Syrius rebrand: seeded demo content still speaks the Lyre lexicon in five
-- charter itineraries and one editorial body. Display names normally come from
-- brand.ts, but these are data — the itinerary JSON and post prose were written
-- with the old surface names inside them.
update public.voyages
set itinerary = replace(replace(itinerary::text, 'Passbook', 'member card'), 'Open Deck', 'Booth')::jsonb
where itinerary::text like '%Passbook%' or itinerary::text like '%Open Deck%';

update public.voyages
set description = replace(replace(coalesce(description,''), 'Passbook', 'member card'), 'Open Deck', 'Booth')
where description like '%Passbook%' or description like '%Open Deck%';

update public.dispatch_posts
set body = replace(replace(coalesce(body,''), 'Open Deck', 'Booth'), 'LYRE SOCIAL', 'SYRIUS SOCIAL'),
    dek  = replace(replace(coalesce(dek,''),  'Open Deck', 'Booth'), 'LYRE SOCIAL', 'SYRIUS SOCIAL')
where body like '%Open Deck%' or dek like '%Open Deck%' or body like '%LYRE%';
