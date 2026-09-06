-- The pacing gates key their per-origin counter on
--   split_part(request.headers->>'x-forwarded-for', ',', 1)
-- which is the LEFTMOST hop — the part the caller writes. A campaign rotating
-- that header got a fresh hourly bucket per request, so the 150/hour arm
-- counted nothing. (The 3/hour per-address arm still held, which is what
-- bounded the damage; this is the other arm.)
--
-- Rather than guess at the forwarded chain, it was observed. A probe function
-- was granted to anon, called through PostgREST from outside, dropped again:
--
--   plain call        x-forwarded-for: "108.193.50.145"
--                     cf-connecting-ip: "108.193.50.145"
--   forged two hops   x-forwarded-for: "203.0.113.9, 198.51.100.7,108.193.50.145"
--                     cf-connecting-ip: "108.193.50.145"
--   forged cf header  HTTP 403 at the edge, error code 1000
--
-- Two facts fall out of that. The real address is APPENDED last, so the
-- rightmost hop is the edge's own reading and the leftmost is decoration. And
-- cf-connecting-ip cannot be forged at all: Cloudflare refuses the request
-- rather than passing a client-set copy through, which is a stronger guarantee
-- than trusting a position in a list.
--
-- So: the unforgeable header first, the rightmost hop as the fallback for any
-- path that does not carry it, and 'unknown' last. Note that 'unknown' is one
-- shared bucket — deliberately, because the alternative is a per-request bucket
-- that counts nothing, and a gate that counts nothing is worse than a gate
-- everyone shares.
create or replace function public.caller_origin()
returns text
language sql
stable
as $fn$
  select coalesce(
    nullif(btrim(current_setting('request.headers', true)::json->>'cf-connecting-ip'), ''),
    nullif(btrim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',',
      greatest(1, array_length(string_to_array(
        coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ','), 1))
    )), ''),
    'unknown'
  );
$fn$;

comment on function public.caller_origin() is
  'The address the EDGE saw, not the one the caller typed. cf-connecting-ip is unforgeable (Cloudflare 403s a request that sets it); the rightmost x-forwarded-for hop is the edge''s own append. Never the leftmost hop, which is decoration.';

create or replace function public.pace_the_applications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare who text; from_here int; for_this_address int;
begin
  who := public.caller_origin();

  perform pg_advisory_xact_lock(hashtext('apply:' || lower(btrim(new.email))));

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into for_this_address
  from public.status_lookups
  where fingerprint = 'apply-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'apply-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Three is a person who mistyped and tried again. It is not a campaign.
  if for_this_address >= 3 then
    raise exception 'an application from that address is already with Shoreside — give it a little time'
      using errcode = '53400';
  end if;

  -- Loose, because on the legitimate path this counts the web server rather
  -- than the applicant. It bounds the direct-to-PostgREST path, which is the
  -- one an attacker uses — and now it counts an address they cannot change.
  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('apply-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('apply-from:' || who);
  return new;
end $fn$;

create or replace function public.pace_the_crew_applications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare who text; from_here int; for_this_address int;
begin
  who := public.caller_origin();

  perform pg_advisory_xact_lock(hashtext('crew-apply:' || lower(btrim(new.email))));

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into for_this_address
  from public.status_lookups
  where fingerprint = 'crew-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'crew-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Higher than the member gate: there are four roles, and a candidate who
  -- wants two of them is not a campaign.
  if for_this_address >= 5 then
    raise exception 'we have your applications — give them a little time'
      using errcode = '53400';
  end if;

  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('crew-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('crew-from:' || who);
  return new;
end $fn$;

drop function if exists public.probe_forwarded_chain();;
