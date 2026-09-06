-- A member could not see where they were signed in, and could not shut a door
-- they had left open.
--
-- The only control was "Sign out", which revokes globally -- and until this
-- morning said the opposite on the label. So a member who signed in on a
-- borrowed laptop, or whose phone was taken, had exactly one lever and it was
-- all-or-nothing. No list, no history, and no letter when somebody signed in
-- as them from a machine they had never used.
--
-- None of that needs a new table. GoTrue already keeps auth.sessions with the
-- agent, the address, when it was made and when it was last refreshed -- so a
-- session list built on our own bookkeeping would be a second copy that drifts
-- from the first, and would miss every sign-in path we forgot to instrument.
-- Reading the provider's own record is both less work and more true.
--
-- And revocation is real revocation. Deleting the session row invalidates the
-- refresh token attached to it, so the far end stops being able to renew and
-- its access token expires within the hour. That is what "sign this device out"
-- has to mean; anything less is a button that lies.

-- ── What is signed in ───────────────────────────────────────────────────────

create or replace function public.my_sessions()
returns table (
  id           uuid,
  started_at   timestamptz,
  last_seen_at timestamptz,
  user_agent   text,
  from_address text,
  second_step  boolean,
  is_this_one  boolean
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $fn$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at, s.updated_at, s.created_at),
         left(s.user_agent, 300),
         /* The address, coarsened. A member should be able to tell "that is
            not my house" without the club handing them a map, and a full
            address in a page they can screenshot is a piece of personal data
            with no use here. The last group is dropped. */
         case
           when s.ip is null then null
           when family(s.ip) = 4 then host(set_masklen(s.ip::cidr, 24))
           else host(set_masklen(s.ip::cidr, 48))
         end,
         s.aal = 'aal2',
         s.id::text = coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')
    from auth.sessions s
   where s.user_id = auth.uid()
     and auth.uid() is not null
   order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc;
$fn$;

revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

comment on function public.my_sessions() is
  'Every session the caller currently holds, newest first, read from the auth provider''s own record rather than from a copy of it -- a second table would drift from the first and would miss any sign-in path nobody remembered to instrument. The address is masked to a /24 or /48: enough for a member to recognise their own house, not enough to be a map.';

-- ── Shutting one ────────────────────────────────────────────────────────────

create or replace function public.revoke_my_session(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare v_gone integer;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  /* The user_id predicate is the whole security of this function: a member may
     end their own sessions and only their own, and the id is a uuid they could
     otherwise guess at forever without effect. */
  delete from auth.sessions s where s.id = p_id and s.user_id = auth.uid();
  get diagnostics v_gone = row_count;
  return v_gone > 0;
end $fn$;

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

comment on function public.revoke_my_session(uuid) is
  'Ends one of the caller''s own sessions. Deleting the row invalidates the refresh token attached to it, so the far end cannot renew and its access token dies within the hour -- which is what the button has to mean. Scoped to auth.uid() so a member can only ever shut their own door.';

-- ── The letter that says somebody signed in ─────────────────────────────────
--
-- Fired from a trigger on auth.sessions rather than from any of our sign-in
-- paths, because there are several and the next one will be added by somebody
-- who has not read this file. A session row is the one thing every path
-- creates.
--
-- It NEVER raises. A trigger on the auth provider's own table that can throw is
-- a trigger that can stop somebody signing in, and no notification is worth
-- that. Everything inside is wrapped, and a failure to write the letter is
-- silence rather than a locked door.

create or replace function public.a_new_sign_in_says_so()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $fn$
declare
  v_email text;
  v_known boolean;
  v_first boolean;
begin
  begin
    select p.email into v_email from public.profiles p where p.id = new.user_id;
    if v_email is null then return new; end if;

    /* The first session a member ever has is them signing in for the first
       time, and telling somebody "a new device signed in" while they are
       looking at the screen that did it is noise. */
    select count(*) <= 1 into v_first from auth.sessions s where s.user_id = new.user_id;
    if v_first then return new; end if;

    /* A device the club has seen before is not news. Matched on the agent
       string, which is coarse -- two identical phones look the same -- and
       coarse in the right direction: it under-reports rather than crying wolf
       every time somebody opens a second tab. */
    select exists (
      select 1 from auth.sessions s
       where s.user_id = new.user_id
         and s.id <> new.id
         and s.user_agent is not distinct from new.user_agent
    ) into v_known;
    if v_known then return new; end if;

    insert into public.email_outbox (to_email, template, payload)
    values (v_email, 'new-sign-in', jsonb_build_object(
      'name', (select p.full_name from public.profiles p where p.id = new.user_id),
      'agent', left(coalesce(new.user_agent, 'a device that did not say what it was'), 200),
      'at', to_char(now() at time zone public.club_zone(), 'FMDay FMDD FMMonth, FMHH12:MIam')
    ));
  exception when others then
    /* Deliberately silent. This runs inside somebody's sign-in. */
    null;
  end;
  return new;
end $fn$;

revoke all on function public.a_new_sign_in_says_so() from public, anon, authenticated;

comment on function public.a_new_sign_in_says_so() is
  'Writes a letter when a member signs in from a device the club has not seen. On a trigger over auth.sessions rather than in any of our sign-in paths, because a session row is the one thing every path creates and the next path will be added by somebody who has not read this. Never raises: a notification is not worth being the reason somebody cannot sign in.';

drop trigger if exists a_new_sign_in_is_worth_a_letter on auth.sessions;
create trigger a_new_sign_in_is_worth_a_letter
after insert on auth.sessions
for each row execute function public.a_new_sign_in_says_so();

insert into public.email_templates (code, description, active, rule_can_send) values
  ('new-sign-in', 'Somebody signed in to a member''s account from a device the club has not seen before.', true, false),
  ('password-changed', 'A member''s password was changed.', true, false),
  ('two-step-on', 'A member turned two-step on.', true, false),
  ('two-step-off', 'A member turned two-step off.', true, false)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
