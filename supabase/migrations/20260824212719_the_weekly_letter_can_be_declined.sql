-- The weekly dispatch went to EVERY active member with no preference consulted
-- anywhere — bulk mail with no mechanism to get off it, while the footer of
-- every letter said "Preferences live in the member app." There were no
-- preferences for this one. /you now carries a switch for it, and this is the
-- half that makes the switch mean something.
--
-- Default true, so nothing changes for anyone who has not expressed a view.
--
-- The address filter here was also stale — `e2e-%` and `%@example.com` only —
-- and had come to rely entirely on the fixture guard downstream. It is left in
-- place as the second line it was always meant to be, not the first.
create or replace function public.build_lore_digest()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    and coalesce((p.notification_prefs->>'digest')::boolean, true)
    and p.email not like 'e2e-%' and p.email not like '%@example.com';

  get diagnostics queued = row_count;
  return queued;
end $function$;
;
