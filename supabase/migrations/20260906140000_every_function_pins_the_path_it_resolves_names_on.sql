-- Six functions resolve unqualified names against whatever search_path the
-- caller happens to be carrying. Every other function in this schema pins
-- 'public' and has since the definer audit; these are the ones that slipped.
--
-- None is SECURITY DEFINER, so this is not the escalation primitive an unpinned
-- definer would be — they run as the caller, with the caller's own rights. The
-- reason to pin them anyway is that three of them are reached FROM definer
-- functions, and a function that does not state where it resolves `split_part`
-- or `btrim` is trusting a decision made somewhere else. The schema's rule is
-- that every function says; these now say.
--
-- Three were written in the last day and are mine: the guard that refuses to
-- delete a member, the one that freezes a posted ledger line, and the reader
-- that works out which address the edge actually saw. The other three predate
-- this work.
alter function public.a_member_is_anonymised_never_deleted() set search_path to 'public';
alter function public.a_posted_line_does_not_move()          set search_path to 'public';
alter function public.caller_origin()                        set search_path to 'public';
alter function public.club_zone()                            set search_path to 'public';
alter function public.knots_booking_reasons()                set search_path to 'public';
alter function public.tier_rank(membership_tier)             set search_path to 'public';
