-- Invite codes minted under the old prefix repoint with the member numbers.
update public.invites set code = replace(code, 'LYR-', 'SYR-') where code like 'LYR-%';
