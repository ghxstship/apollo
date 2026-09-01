/* The other half of the option.

   hold_a_cabin_on_option() counts boardings before it grants a hold. Without
   this, nothing counts holds before it grants a boarding — so a member takes a
   cabin on a 72-hour option, someone else books the same cabin outright the
   same afternoon, and the option is worth nothing except as a promise the club
   made and then sold out from under.

   Rewritten from pg_get_functiondef with three additions, on the SAME advisory
   lock key hold_a_cabin_on_option() takes, so a hold and a boarding queue
   behind each other rather than both reading the last place as free:

     1. expired options are released inside the lock, before anything is counted
        (lazy, so no scheduler has to be running for the rule to be true);
     2. live options held by OTHER members count against the cabin;
     3. the booker's own option on this cabin is stamped confirmed, because a
        member exercising their own hold is the hold ending well, and leaving it
        open would let one member hold the room they are already in.

   The refusal also stops saying "berths". The word is retired — the lexicon
   guard reads this exception out of rendered HTML on every member page — and
   the club's word for what a cabin has is places. */
CREATE OR REPLACE FUNCTION public.guard_cabin_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cap integer;
  taken integer;
  now_occupies boolean;
  did_occupy boolean;
begin
  if new.cabin_id is null then return new; end if;

  now_occupies := new.status = 'aboard';
  did_occupy := tg_op = 'UPDATE'
                and old.cabin_id is not distinct from new.cabin_id
                and old.status = 'aboard';

  -- Already counted in this cabin and still there: nothing new is claimed.
  if not now_occupies or did_occupy then return new; end if;

  -- Everyone asking about this cabin on this sailing queues here, so the count
  -- below cannot be read by two transactions that then both write.
  perform pg_advisory_xact_lock(
    hashtext('cabin:' || new.cabin_id::text || ':' || new.voyage_id::text));

  select berths into cap from public.cabins where id = new.cabin_id and active;
  if cap is null then raise exception 'no such cabin'; end if;

  -- A hold that has run out stops holding the moment someone asks for the room.
  update public.charter_options
     set released_at = expires_at
   where voyage_id = new.voyage_id and cabin_id = new.cabin_id
     and released_at is null and confirmed_at is null
     and expires_at <= now();

  select count(*) into taken from (
    select 1 from public.rsvps
     where voyage_id = new.voyage_id and cabin_id = new.cabin_id
       and status = 'aboard' and id <> new.id
    union all
    select 1 from public.charter_options o
     where o.voyage_id = new.voyage_id and o.cabin_id = new.cabin_id
       and o.profile_id <> new.profile_id
       and o.released_at is null and o.confirmed_at is null
  ) held;

  if taken >= cap then
    raise exception 'that cabin is spoken for — % places, all claimed or held', cap;
  end if;

  -- The member is taking the room they were holding. The hold has done its job.
  update public.charter_options
     set confirmed_at = now()
   where voyage_id = new.voyage_id and cabin_id = new.cabin_id
     and profile_id = new.profile_id
     and released_at is null and confirmed_at is null;

  return new;
end;
$function$;

/* Posting a hold on a leg. A definer rather than a staff UPDATE through the
   policy, for two reasons that both cost real money if they go wrong.

   First, hold_posted_at is the club's word about when it told people, and a
   value typed into a form is a value that can be backdated to make an 08:00
   promise look kept.

   Second, and this is the one: it must be impossible to reach for this and move
   `voyages.status` instead. That column fires handle_voyage_status(), which
   mails every aboard and waitlisted member who has weather notices switched on,
   queues the weather-hold letter, and on the adjacent cancel branch posts a full
   account credit. Holding a whole sailing to move one leg of it sends real
   letters about an event that did not stop. This function touches voyage_legs
   and nothing else, and that is the entire point of it. */
create or replace function public.post_a_leg_hold(
  p_leg uuid, p_reason text, p_new_plan text, p_unchanged text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0
     or length(btrim(coalesce(p_new_plan, ''))) = 0
     or length(btrim(coalesce(p_unchanged, ''))) = 0 then
    /* The constraint would refuse this anyway; saying it here says WHICH of the
       three is missing to the person who has to write it. */
    raise exception 'a hold states the reason, the new plan, and what is unchanged — all three';
  end if;

  update public.voyage_legs
     set status = 'held',
         hold_reason = btrim(p_reason),
         hold_new_plan = btrim(p_new_plan),
         hold_unchanged = btrim(p_unchanged),
         hold_posted_at = now(),
         posted_at = now()
   where id = p_leg;
  if not found then raise exception 'no such leg'; end if;
end;
$$;

create or replace function public.lift_a_leg_hold(p_leg uuid, p_revised boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  update public.voyage_legs
     set status = case when p_revised then 'revised' else 'planned' end,
         hold_reason = null, hold_new_plan = null, hold_unchanged = null,
         hold_posted_at = null, posted_at = now()
   where id = p_leg;
  if not found then raise exception 'no such leg'; end if;
end;
$$;

revoke all on function public.post_a_leg_hold(uuid, text, text, text) from public;
revoke all on function public.lift_a_leg_hold(uuid, boolean) from public;
grant execute on function public.post_a_leg_hold(uuid, text, text, text) to authenticated;
grant execute on function public.lift_a_leg_hold(uuid, boolean) to authenticated;
;
