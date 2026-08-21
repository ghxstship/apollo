-- Syrius rebrand, the data layer. Two kinds of Lyre residue live in rows rather
-- than code: prose written with the old names, and the demo/e2e identities
-- themselves, whose @lyre.social addresses render in the members CRM and the
-- Bridge. Real members would keep their addresses; every one of these accounts
-- is ours, so they move to the new domain.

-- ===== prose =====
update public.rewards
set name = replace(name, 'Chandlery', 'Slop Chest'),
    detail = replace(coalesce(detail,''), 'Chandlery', 'Slop Chest')
where name like '%Chandlery%' or detail like '%Chandlery%';

update public.account_ledger
set memo = replace(memo, 'Chandlery', 'Slop Chest')
where memo like '%Chandlery%';

update public.crew_roles
set title = 'Producer systems engineering',
    blurb = 'You build the Producer — the assistant that answers before Shoreside wakes.'
where title like '%Aurora%';

update public.fathoms_ledger
set reason = replace(reason, 'Chandlery', 'Slop Chest')
where reason like '%Chandlery%';

update public.notifications
set title = replace(replace(title, 'Chandlery', 'Slop Chest'), 'Open Deck', 'Booth'),
    body  = replace(replace(coalesce(body,''), 'Chandlery', 'Slop Chest'), 'Open Deck', 'Booth')
where title like '%Chandlery%' or body like '%Chandlery%'
   or title like '%Open Deck%' or body like '%Open Deck%';

-- ===== identities (demo + e2e + staff personas only) =====
create or replace function public._rebrand_email(e text) returns text language sql immutable as $$
  select replace(replace(e, '@demo.lyre.social', '@demo.syrius.social'), '@lyre.social', '@syrius.social')
$$;

update auth.users
set email = public._rebrand_email(email)
where email like '%lyre.social';

update auth.identities
set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(public._rebrand_email(identity_data->>'email')))
where identity_data->>'email' like '%lyre.social';

update public.profiles set email = public._rebrand_email(email) where email like '%lyre.social';
update public.member_roll set email = public._rebrand_email(email) where email like '%lyre.social';
update public.applications set email = public._rebrand_email(email) where email like '%lyre.social';

drop function public._rebrand_email(text);
