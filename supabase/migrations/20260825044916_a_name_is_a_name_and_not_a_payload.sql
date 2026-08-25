-- profiles' only CHECK was profiles_status_check. guard_privileged_profile_columns
-- protects is_staff, tier, status, plan_id, member_no, email, joined_at,
-- calendar_token and stripe_customer_id — every column a member must not set
-- about THEMSELVES — and says nothing about the three free-text columns a
-- member sets about themselves and everyone else has to render.
--
-- Verified: a member PATCHed a 2 MB full_name straight through PostgREST and it
-- was accepted; another member's /rest/v1/member_directory then returned 2.1 MB
-- across fourteen rows. The server action at you/actions.ts checks bio length
-- and checks full_name only for emptiness — and the action is beside the point,
-- because the anon key is public and RLS grants `authenticated` the UPDATE
-- directly. Anything the database does not bound is not bounded.
--
-- full_name renders unclamped on /directory, every directory profile, every
-- message byline, every Open Deck byline, /manifest, and the Bridge's member
-- and moderation consoles. .dir-bio is white-space:pre-wrap with a max-width
-- and no line clamp. So the largest thing one member can make another member's
-- browser render is not a message — messages_body_check bounds those at 4000 —
-- it is a NAME.
--
-- Bounds sized to the product rather than to the storage: 120 for a name (the
-- longest real one here is 15), 400 for a bio, which is what the form already
-- claims to enforce, and 32 for a handle. Trim-and-non-empty on the name too,
-- because " " is not a name and the form only tested for empty.
--
-- Nothing needs backfilling: the longest values in the table today are 15, 95
-- and 10 characters.
alter table public.profiles
  drop constraint if exists profiles_full_name_is_sane;
alter table public.profiles
  add constraint profiles_full_name_is_sane
  check (full_name is null or (length(btrim(full_name)) between 1 and 120));

alter table public.profiles
  drop constraint if exists profiles_bio_is_sane;
alter table public.profiles
  add constraint profiles_bio_is_sane
  check (bio is null or length(bio) <= 400);

alter table public.profiles
  drop constraint if exists profiles_handle_is_sane;
alter table public.profiles
  add constraint profiles_handle_is_sane
  check (handle is null or (length(btrim(handle)) between 1 and 32));

-- crew_requests.note has no CHECK, no server bound, no maxLength on the
-- textarea, and /manifest fetches every open request across every voyage
-- unpaginated and renders the note inline. Four missing bounds on one path,
-- member to member.
alter table public.crew_requests
  drop constraint if exists crew_requests_note_is_sane;
alter table public.crew_requests
  add constraint crew_requests_note_is_sane
  check (note is null or length(note) <= 500);
;
