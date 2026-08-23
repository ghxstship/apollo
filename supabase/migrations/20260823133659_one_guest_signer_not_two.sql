-- Widening the signature left the nine-argument version in place beside the new
-- ten-argument one. PostgREST would resolve either, and the old one does not
-- record the camera choice — the same stray-overload trap that once left a real
-- trigger untouched while a duplicate absorbed the fix.
drop function if exists public.sign_document_as_guest(uuid, text, boolean, text, text, text, text, text, text);
