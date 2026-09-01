-- The release trigger already reads coalesce(auto_claim, true): the DESIGN is
-- that queueing means wanting the seat, and the toggle is the member's "don't
-- take it for me". The column landed with default false, which flipped every
-- plain waitlist join to offer-only and stranded the line behind members who
-- never said no. The default now states what the trigger always assumed.
alter table public.rsvps alter column auto_claim set default true;

-- No member has ever SET the toggle — the surface that writes it has not
-- shipped — so every false on a queued pass is the wrong default, not a choice.
update public.rsvps set auto_claim = true
 where status = 'waitlist' and auto_claim = false;;
