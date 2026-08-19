-- Secrets live in Vault; the edge function reads them via a service-role-only RPC.
create extension if not exists supabase_vault;

create or replace function public.get_app_secret(p_name text)
returns text language plpgsql security definer set search_path = public, vault as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
end $$;
revoke execute on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role;

-- Weekly LORE digest: queue one email per active member with the latest entries.
create or replace function public.build_lore_digest()
returns int language plpgsql security definer set search_path = public as $$
declare
  items jsonb;
  queued int := 0;
begin
  select jsonb_agg(jsonb_build_object('title', title, 'dek', dek) order by published_at desc)
  into items
  from (select title, dek, published_at from public.dispatch_posts order by published_at desc limit 4) t;
  if items is null then return 0; end if;
  insert into public.email_outbox (to_email, template, payload)
  select p.email, 'lore-digest', jsonb_build_object('name', p.full_name, 'items', items)
  from public.profiles p
  where p.status = 'active' and p.email is not null
    and p.email not like 'e2e-%' and p.email not like '%@example.com';
  get diagnostics queued = row_count;
  return queued;
end $$;
revoke execute on function public.build_lore_digest() from public, anon, authenticated;

-- Cron: drain the outbox every 5 minutes; build the digest Sundays 16:00 UTC
-- (09:00 Marina del Rey). The function keeps JWT verification on — the anon
-- key is a valid JWT and is public by design.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-outbox-drain', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://mpyvwpunwrioakmtmcdo.supabase.co/functions/v1/send-outbox',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weXZ3cHVud3Jpb2FrbXRtY2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk5MjEsImV4cCI6MjEwMDQyNTkyMX0.91_S2wHsAz1j-5lrkf_k4iZx6EwF1CUQT1Nn4xY-Oxk'
       ),
       body := '{}'::jsonb) $$
);

select cron.schedule(
  'lore-digest-sundays', '0 16 * * 0',
  $$ select public.build_lore_digest() $$
);
