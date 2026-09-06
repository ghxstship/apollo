-- A member could see nothing about their own account's history.
--
-- audit_log has exactly one policy and it is is_staff(). Both readers are
-- Bridge screens. And record_the_change fires on twenty-one tables, none of
-- which is profiles -- so a staff correction to a member's own record, made
-- under the "staff correct member records" policy, left no line anywhere at
-- all. Not for the member, and not for the Bridge either.
--
-- The obvious fix makes the privacy problem worse. record_the_change writes
-- to_jsonb(old) and to_jsonb(new) -- the WHOLE row -- and audit_log is retained
-- four hundred days. Pointing it at profiles would put every member's name,
-- address, telephone number and biography into a second table on a longer
-- clock than the profile itself, and that second copy is precisely what the
-- erasure sweep does not reach. It would trade a missing feature for a data
-- spill.
--
-- So profiles gets its own recorder, which writes down WHICH fields moved and
-- not what they said. "email changed" is the whole of what a member needs to
-- see, the whole of what the Bridge needs for accountability, and it is not
-- personal data -- so it can sit out its four hundred days without being
-- something that has to be erased later.

create or replace function public.record_the_profile_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  b jsonb := to_jsonb(old);
  a jsonb := to_jsonb(new);
  moved text[] := '{}';
  k text;
  /* Columns whose VALUES may be recorded, because none of them identifies
     anybody: they are switches and states. Everything not on this list has its
     movement recorded and its value withheld. An allow-list rather than a
     deny-list, so a column added next year is private until somebody decides
     otherwise -- the safe direction for a table nobody thinks about again. */
  tellable constant text[] := array[
    'status','tier','is_staff','in_directory','on_manifest','on_camera',
    'phone_verified','jurisdiction','locale','home_city','avatar_tone'
  ];
begin
  if a = b then return new; end if;

  for k in select jsonb_object_keys(a) loop
    if a -> k is distinct from b -> k then
      moved := moved || k;
    end if;
  end loop;
  if array_length(moved, 1) is null then return new; end if;

  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (
    'profiles', new.id::text, 'UPDATE', auth.uid(),
    (select jsonb_object_agg(f, case when f = any (tellable) then b -> f else '"withheld"'::jsonb end)
       from unnest(moved) f),
    (select jsonb_object_agg(f, case when f = any (tellable) then a -> f else '"withheld"'::jsonb end)
       from unnest(moved) f)
  );
  return new;
end $fn$;

revoke all on function public.record_the_profile_change() from public, anon, authenticated;

comment on function public.record_the_profile_change() is
  'Records that a profile changed and which fields moved, withholding the values of everything that identifies anybody. Deliberately not record_the_change: that one stores the whole row, and pointing it at profiles would put every member''s name and address into a second table retained four hundred days -- a copy the erasure sweep does not reach.';

drop trigger if exists a_profile_change_leaves_a_line on public.profiles;
create trigger a_profile_change_leaves_a_line
after update on public.profiles
for each row execute function public.record_the_profile_change();

-- ── What the member may read ────────────────────────────────────────────────
--
-- Not a policy on audit_log. That table also holds lines for club_settings,
-- membership_plans and nineteen other things the club runs on, and a policy
-- wide enough to show a member their own profile lines is a policy one join
-- away from showing them somebody else's. The sealed-view idiom instead: this
-- runs as its owner, sees past the staff-only policy, and can only ever return
-- rows whose row_id is the caller's own.

create or replace view public.my_account_history
with (security_invoker = false) as
select l.at,
       'profile'::text as what,
       l.action,
       (l.actor_id is distinct from l.row_id::uuid) as by_the_club,
       (select array_agg(k order by k) from jsonb_object_keys(coalesce(l.after, l.before)) k) as fields,
       l.after
  from public.audit_log l
 where l.table_name = 'profiles'
   and l.row_id = (select auth.uid())::text
   and (select auth.uid()) is not null

union all

select c.at,
       'consent'::text,
       case when c.granted then 'GRANTED' else 'WITHDRAWN' end,
       (c.source = 'staff'),
       array[c.subject],
       jsonb_build_object('subject', c.subject, 'granted', c.granted, 'text_version', c.text_version)
  from public.consent_records c
 where c.profile_id = (select auth.uid())
   and (select auth.uid()) is not null;

comment on view public.my_account_history is
  'What has happened to the caller''s own account: every recorded change to their profile, and every consent granted or withdrawn. Runs as its owner to see past "the bridge reads the log" on audit_log -- a policy wide enough to expose a member''s own lines on that table would be one join from exposing somebody else''s, and audit_log also carries the club''s own settings. Withheld values stay withheld here: the member is told which field moved, not what it used to say, because what it used to say is the very thing the erasure sweep exists to remove. by_the_club is true when somebody other than the member made the change.';

grant select on public.my_account_history to authenticated;
revoke all on public.my_account_history from anon;

notify pgrst, 'reload schema';
