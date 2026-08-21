-- The feed's name reverted to Open Deck; "the Booth" survives only as the
-- composer's confession-booth motif (lowercase, kit-sanctioned). Earlier seed
-- migrations wrote capital-B "The Booth" into content — repoint it.
update public.dispatch_posts
set body = replace(body, 'The Booth is a deck, not a stage', 'The Open Deck is a deck, not a stage')
where body ~ 'The Booth';

update public.voyages
set itinerary = replace(itinerary::text, 'The Booth hears about it.', 'The Open Deck hears about it.')::jsonb
where itinerary::text ~ 'The Booth';
