-- Sessions never expired, and the session list made that visible.
--
-- One fixture member holds 490 of them. Real members will hold fewer and the
-- number still only goes up: every sign-in makes a row, nothing removes one,
-- and a refresh token that has not been used since spring is a credential
-- sitting on a laptop somebody sold.
--
-- It went unnoticed because nothing read the table. The moment a member can
-- SEE where they are signed in, a list of four hundred entries is not a
-- security feature, it is a wall of text with the one line that matters
-- somewhere in it -- which is worse than no list, because it looks like
-- diligence.
--
-- So sessions get a retention rule like everything else the club keeps, on the
-- same dial pattern and swept by the same nightly job. Thirty days without a
-- refresh: a device in daily use refreshes hourly, so thirty days means the
-- device is gone, reinstalled, or was never coming back. Deleting the row is
-- exactly what "shut this one" does, and the member is not signed out of
-- anything they were actually using.

insert into public.club_settings (key, value_int, note) values
  ('session_stale_days', 30,
   'How long a session may go without being refreshed before the club closes it. A device in daily use refreshes hourly, so this only reaches devices that are gone. Shown to members on the retention schedule, because a session is a credential and how long the club holds one is their business.')
on conflict (key) do nothing;

create or replace function public.sweep_stale_sessions()
returns integer
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  n integer := 0;
  days integer := greatest(1, coalesce(public.club_setting('session_stale_days'), 30));
begin
  /* Wrapped, like every other sweep the nightly run makes: a failure here must
     not take the rest of the retention run with it. */
  begin
    delete from auth.sessions s
     where coalesce(s.refreshed_at, s.updated_at, s.created_at) < now() - make_interval(days => days);
    get diagnostics n = row_count;
  exception when others then
    perform public.note_cron_skip('sweep_stale_sessions', 'all', sqlerrm, sqlstate);
    return 0;
  end;
  return n;
end $fn$;

revoke all on function public.sweep_stale_sessions() from public, anon, authenticated;

comment on function public.sweep_stale_sessions() is
  'Closes sessions that have gone club_setting(''session_stale_days'') without a refresh. A device in daily use refreshes hourly, so this reaches only devices that are gone — and deleting the row is exactly what a member pressing "shut this one" does. Runs nightly beside the other retention sweeps.';

select cron.schedule('sessions-stale-nightly', '25 4 * * *', $$select public.sweep_stale_sessions()$$);

-- And it joins the schedule members are shown, because a session is a
-- credential and how long the club holds one is their business.
create or replace view public.retention_schedule
with (security_invoker = on) as
select * from (values
  ('Notices in your feed',            'notice_retention_days',            'Read notices are swept after this long. Unread ones stay.'),
  ('Letters and texts we sent you',   'outbox_retention_days',            'The copy of what was sent, not the fact that it was.'),
  ('The change log on club records',  'audit_retention_days',             'Which record changed, when, and by whom.'),
  ('A phone that stopped listening',  'wallet_registration_stale_days',   'A device registered for pass updates that has gone quiet.'),
  ('A session you stopped using',     'session_stale_days',               'A device signed in and never seen again is signed out. You can shut one yourself at any time from your settings.'),
  ('Your profile after you depart',   'departed_erasure_days',            'Then your name, address and telephone number are erased from the profile and from the sign-in behind it.'),
  ('Signed declarations',             'signature_retention_years',        'Held in years, not days -- the limitation period on what the signature evidences.')
) as t(what, dial, why)
;

comment on view public.retention_schedule is
  'The club''s retention periods, named by the dial that enforces them so the published schedule cannot drift from the jobs. Read together with club_setting() for the number. Deliberately a list of dials rather than a list of numbers: a schedule that holds its own copy of the figure is a schedule that goes stale the first time somebody turns one.';

grant select on public.retention_schedule to authenticated, anon;

notify pgrst, 'reload schema';
