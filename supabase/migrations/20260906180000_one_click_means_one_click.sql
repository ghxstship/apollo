-- The unsubscribe header named a page, and a page is not one click.
--
-- Marketing letters carry List-Unsubscribe pointing at /you, and the sender's
-- own comment is honest about why there is no more: RFC 8058 one-click needs an
-- endpoint that acts on an UNAUTHENTICATED POST, and the club did not have one.
-- Naming a capability we do not have would have been worse than naming none.
--
-- Two things follow from that being the state, and neither is small. The link
-- goes to a page behind the gangway, so a member who is signed out -- which is
-- most people most of the time, and every recipient who is not a member at all
-- -- clicks unsubscribe and is asked to sign in. And Gmail and Yahoo have
-- required one-click on bulk mail since 2024, so the letters are not merely
-- inconvenient to leave, they are the kind that gets filtered.
--
-- This is the endpoint's half: an opaque token per address, minted when a
-- marketing letter is rendered, spent by an unauthenticated POST. The route
-- that receives it is in the application.
--
-- Why a token table and not an HMAC. An HMAC needs the same secret in the edge
-- function and in the application, which is a third place to rotate a secret
-- and a fourth to leak one. A row is revocable, countable, and can be expired;
-- it also lets the club answer "did they actually click it" months later, which
-- an HMAC cannot.

create table if not exists public.unsubscribe_links (
  token      uuid        primary key default gen_random_uuid(),
  email      text        not null,
  made_at    timestamptz not null default now(),
  spent_at   timestamptz,
  spent_from text
);

comment on table public.unsubscribe_links is
  'One opaque token per address, so a marketing letter can carry a List-Unsubscribe that works without signing in. A token identifies an address and nothing else: it grants no session, reads no data, and the only thing it can do is stop mail. Spending one marks it rather than deleting it, because "they unsubscribed on the 4th" is a fact the club may need to show.';
comment on column public.unsubscribe_links.spent_from is
  'What the request said about itself when the token was spent -- the mail client''s agent string, usually. Kept because a one-click header is fetched by machines as well as people, and telling the two apart later is otherwise impossible.';

create index if not exists unsubscribe_links_email_idx on public.unsubscribe_links (email, made_at desc);

alter table public.unsubscribe_links enable row level security;
revoke all on public.unsubscribe_links from anon, authenticated;

/* No policy for anybody. A token is a credential: holding one is the whole of
   the authority it carries, so a table anyone could read would be a table
   anyone could unsubscribe the entire roster from. Both functions below are
   definer and reached only by the service role. */

create or replace function public.unsubscribe_token_for(p_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_token uuid;
begin
  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'an unsubscribe link needs an address' using errcode = '22023';
  end if;

  /* Reuse an unspent token for the address rather than minting one per letter.
     A member with forty letters in their archive should not be carrying forty
     live tokens, and any one of the forty should still work. */
  select token into v_token
    from public.unsubscribe_links
   where email = lower(btrim(p_email)) and spent_at is null
   order by made_at desc limit 1;

  if v_token is null then
    insert into public.unsubscribe_links (email) values (lower(btrim(p_email)))
    returning token into v_token;
  end if;
  return v_token;
end $fn$;

revoke all on function public.unsubscribe_token_for(text) from public, anon, authenticated;

comment on function public.unsubscribe_token_for(text) is
  'The live unsubscribe token for an address, minting one if there is none. Reuses an unspent token rather than issuing one per letter, so every letter in somebody''s archive keeps working and nobody is carrying forty live credentials. Service role only.';

create or replace function public.spend_unsubscribe_token(p_token uuid, p_agent text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_email text;
begin
  perform pg_advisory_xact_lock(hashtext('unsub:' || p_token::text));

  select email into v_email from public.unsubscribe_links
   where token = p_token and spent_at is null;

  /* A token already spent answers TRUE. One-click is fetched by mail clients,
     sometimes more than once, and telling somebody "that did not work" when
     they are already unsubscribed would be both untrue and alarming. */
  if v_email is null then
    return exists (select 1 from public.unsubscribe_links where token = p_token);
  end if;

  update public.unsubscribe_links
     set spent_at = now(), spent_from = left(nullif(btrim(coalesce(p_agent,'')),''), 200)
   where token = p_token;

  insert into public.email_suppressions (email, reason, source)
  values (v_email, 'unsubscribed', 'one-click')
  on conflict (email) do update
     set reason = 'unsubscribed', source = 'one-click', recorded_at = now();

  /* And the switch on their own settings page, so the two never disagree. A
     member who unsubscribed from an email client and then opens /you must not
     find every marketing toggle still on. */
  update public.profiles p
     set notification_prefs = coalesce(p.notification_prefs, '{}'::jsonb)
                              || jsonb_build_object('digest', false, 'fathoms', false)
   where lower(p.email) = v_email;

  return true;
end $fn$;

revoke all on function public.spend_unsubscribe_token(uuid, text) from public, anon, authenticated;

comment on function public.spend_unsubscribe_token(uuid, text) is
  'Spends a one-click unsubscribe token: suppresses the address, turns the marketing switches off on the matching profile, and marks the token. Answers true for a token already spent, because one-click is fetched by machines that retry and "that did not work" would be both untrue and alarming. Service role only, from the unauthenticated POST route RFC 8058 requires.';

notify pgrst, 'reload schema';
