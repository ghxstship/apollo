-- Two defects the membership tests reproduced.
--
-- handle_subscription_status compared new.status against 'unpaid', which is
-- not a label of subscription_status (the webhook maps Stripe's unpaid to
-- past_due). Every UPDATE to canceled raised 22P02, so the cancellation sync
-- failed, the dues hold on a lapse never landed, and the win-back letter had
-- nobody to write to. One word, by surgery on the live body.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_subscription_status' and p.pronamespace = 'public'::regnamespace;
  if src not like '%elsif new.status in (''canceled'',''unpaid'') and old.status in (''active'',''trialing'',''past_due'') then%' then
    raise exception 'handle_subscription_status: anchor missing — re-read before patching';
  end if;
  src := replace(src, 'elsif new.status in (''canceled'',''unpaid'') and old.status in (''active'',''trialing'',''past_due'') then',
                      'elsif new.status = ''canceled'' and old.status in (''active'',''trialing'',''past_due'') then');
  execute src;
end $$;

-- The plain application INSERT bounds name, email, city and note by policy,
-- and nothing bounded answers: a 1001-character answer and an unknown
-- question key both landed, and a required question could be skipped by
-- anyone who bypassed the form. The same bounds apply_with_invite carries,
-- as a trigger, so both doors agree.
create or replace function public.guard_the_answers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare k text;
begin
  if jsonb_typeof(coalesce(new.answers, '{}'::jsonb)) <> 'object' then
    raise exception 'answers arrive keyed by question';
  end if;
  for k in select jsonb_object_keys(coalesce(new.answers, '{}'::jsonb)) loop
    if not exists (select 1 from public.application_questions q where q.key = k) then
      raise exception 'that is not one of the questions';
    end if;
    if char_length(coalesce(new.answers->>k, '')) > 1000 then
      raise exception 'an answer is up to a thousand characters';
    end if;
  end loop;
  if exists (select 1 from public.application_questions q
              where q.active and q.required
                and nullif(btrim(coalesce(new.answers->>q.key, '')), '') is null) then
    raise exception 'one of the committee''s questions is unanswered';
  end if;
  if new.proposer is not null and char_length(new.proposer) > 120 then
    raise exception 'a proposer is a name, not a paragraph';
  end if;
  return new;
end $function$;
revoke all on function public.guard_the_answers() from public, anon, authenticated;
drop trigger if exists a_guard_the_answers on public.applications;
create trigger a_guard_the_answers
  before insert on public.applications
  for each row execute function public.guard_the_answers();;
