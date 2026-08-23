-- Minting was fixed to emit name-free codes, but the codes already issued were
-- never migrated. Worse, validate_invite is SECURITY DEFINER, granted to anon,
-- and handed back the inviter's FULL NAME for any valid code — with no consumer
-- anywhere in the product. It answers whether a code is good, and nothing else.
update public.invites
set code = 'SYR-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4))
                  || '-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 5, 4))
where code !~ '^SYR-[A-Z0-9]{4}-[A-Z0-9]{4}$';

drop function if exists public.validate_invite(text);

create or replace function public.validate_invite(p_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(p_code)) and uses < max_uses
  );
$$;

revoke execute on function public.validate_invite(text) from public;
grant execute on function public.validate_invite(text) to anon, authenticated;

comment on function public.validate_invite(text) is
  'Is this code good? Nothing more — it used to answer with the inviter''s name, to anyone who asked.';
