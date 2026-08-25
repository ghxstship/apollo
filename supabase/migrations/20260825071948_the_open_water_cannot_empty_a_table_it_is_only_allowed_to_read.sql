/* TRUNCATE is the privilege nobody checks for.

   security_report()'s anon_write_grants invariant tests INSERT, UPDATE and
   DELETE and stops there, and every table in this schema — profiles, rsvps and
   fathoms_ledger included — hands anon TRUNCATE, REFERENCES and TRIGGER from
   Supabase's default privileges. TRUNCATE is not a DELETE with a faster plan:
   row-level security does not apply to it at all, so a policy that refuses to
   let you delete one row does not refuse to let you delete every row.

   It is currently latent rather than exploitable, because PostgREST issues only
   SELECT/INSERT/UPDATE/DELETE and RPC — there is no route from the publishable
   key to a TRUNCATE statement. Latent is not the same as absent, and the
   distance between them is one SECURITY INVOKER function that someone adds for
   an unrelated reason.

   This takes it back on the eight tables this module added. It does NOT take it
   back schema-wide: that is sixty-odd tables three agents are editing this week
   and it belongs in one deliberate pass, not in the middle of a feature.

   The INSERT/UPDATE/DELETE revokes are re-applied because they were already
   applied once and came back — something ran a blanket grant across the schema
   after these tables were created. The policies are what actually hold the line
   (a member has no write policy on any of these), and the e2e suite asserts the
   refusal rather than the grant, so a third blanket grant cannot make the suite
   go quiet about it. */
revoke truncate, references, trigger on public.activity_formats from anon, authenticated;
revoke truncate, references, trigger on public.club_products from anon, authenticated;
revoke truncate, references, trigger on public.voyage_legs from anon, authenticated;
revoke truncate, references, trigger on public.voyage_stops from anon, authenticated;
revoke truncate, references, trigger on public.charter_options from anon, authenticated;
revoke truncate, references, trigger on public.membership_pauses from anon, authenticated;
revoke truncate, references, trigger on public.member_number_releases from anon, authenticated;
revoke truncate, references, trigger on public.member_qr_tokens from anon, authenticated;

/* Catalogue tables: anon reads, authenticated reads, and the staff policy is
   what turns a write grant into a write. */
revoke insert, update, delete on public.activity_formats from anon;
revoke insert, update, delete on public.club_products from anon;
revoke insert, update, delete on public.voyage_legs from anon;
revoke insert, update, delete on public.voyage_stops from anon;

/* Written by definers only. An option's 72 hours, a pause window, a released
   number and a 60-second credential are all facts the club states about a
   member; none of them is a form a member fills in. */
revoke insert, update, delete on public.charter_options from anon;
revoke insert, update on public.charter_options from authenticated;
revoke insert, update, delete on public.membership_pauses from anon, authenticated;
revoke insert, update, delete on public.member_number_releases from anon, authenticated;
revoke insert, update, delete on public.member_qr_tokens from anon, authenticated;
;
