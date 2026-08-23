-- Placeholder: the first attempt at this guard used an anchor string that does
-- not appear in sign_document_as_guest ("that token is not ours" — the real text
-- is "that link is not recognised"), so it silently did nothing. The working
-- version is the migration that follows.
select 1;
