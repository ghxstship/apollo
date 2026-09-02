import "server-only";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/* WHAT A STANDING DOES TO THE DUES.

   The product has always kept two separate things and coupled them in one
   direction only. STANDING (profiles.status) governs what a member may DO.
   DUES (a Stripe subscription) govern what they PAY. The webhook maps Stripe
   onto standing; nothing mapped standing onto Stripe. So a member who paused
   or departed changed what they could do and nothing whatsoever about what
   they were charged — while both dialogs told them otherwise.

   A NOTE ON THE WORD "HOLD". A WEATHER HOLD is an EPISODE paused for conditions
   (voyages.status = 'weather_hold'), called by 18:00 the night before, and it
   is what the `weather` notification preference governs. Nothing in this file
   has anything to do with it.

   Everything below is about a PAUSED MEMBERSHIP — profiles.status = 'paused'.
   The membership state used to be dressed in the weather-hold metaphor across
   the app; it no longer is, on the owner's instruction. The two share no
   column, no trigger and no preference, and putting both on one screen under
   one phrase told members nothing. The word is "pause", which is what the
   column says, what the button says, and what every other club calls it.

   The rules, stated once here so the copy and the code cannot drift:

     MEMBERSHIP PAUSED  collection pauses. Nothing is refunded for the period
                        already paid — they are simply not billed again while
                        the membership is paused.
     RESUMED            collection restarts on the next cycle.
     DEPARTED           the subscription cancels AT PERIOD END. They keep what
                        they have already paid for until it lapses, and nothing
                        further is taken.

   No refund is issued by any of these. "Unused months credit back" — which the
   depart dialog used to promise — is outward money movement fired by a
   self-service button, and it is not needed: if nothing further is taken and
   what was paid still runs its term, nobody is out of pocket.

   THE SAFETY PROPERTY, which matters more than any of the above: if Stripe is
   not configured, or the call fails, the STANDING CHANGE STILL HAPPENS and the
   caller is told the dues did not stop. A member must never be told their
   money stopped moving when it did not. Every function here returns what
   actually happened rather than throwing, so the caller can say so. */

export type DuesOutcome =
  | { kind: "changed" }
  /* No subscription to act on — a member who never took a paid standing. */
  | { kind: "nothing-to-do" }
  /* Stripe is switched off in this environment. Not an error; a fact to relay. */
  | { kind: "not-wired" }
  | { kind: "failed"; detail: string };

/* WHICH SUBSCRIPTION IS "THE" ONE. Three places asked this and three answered
   differently: this file filtered to live statuses and ordered by updated_at,
   while /account and the Bridge drawer took the newest by created_at with no
   status filter at all. For a member carrying a superseded row — an interval
   change, or a re-subscribe — /account could show a CANCELED subscription as
   "Closed" while Pause and Depart acted on a different, live one. The member
   and the club would then be reading two different records and both would be
   right about the one they were looking at.

   One definition, exported, used by all three. A subscription is live if the
   provider still considers it chargeable; the most recently updated wins,
   because that is the one an action would move. */
export const LIVE_DUES_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

export type LiveSubscription = {
  status: string;
  interval: "year" | "month" | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  plan_id: string | null;
  stripe_subscription_id: string | null;
};

/* The one reader. Takes the caller's own client so a member page runs under the
   member's RLS and the Bridge runs under staff's, while both resolve the SAME
   row this file would act on. */
export async function liveSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<LiveSubscription | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, interval, current_period_end, cancel_at_period_end, plan_id, stripe_subscription_id")
    .eq("profile_id", userId)
    .in("status", LIVE_DUES_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LiveSubscription | null) ?? null;
}

/* What a SCREEN should show, which is not quite what an ACTION should move.
   /account renders a canceled subscription as "Closed", and a member who has
   left should still see that rather than a blank where their dues were — so
   filtering to live statuses alone would lose them.

   The fault being fixed is narrower than "these queries differ": it is that a
   superseded CANCELED row, being newer by created_at, outranked a live one and
   the screen then disagreed with the button. Preferring the live row and
   falling back to the most recent of any status keeps "Closed" for someone who
   really has none, and makes the screen agree with the action whenever both
   exist. */
export async function subscriptionToShow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<LiveSubscription | null> {
  const live = await liveSubscription(supabase, userId);
  if (live) return live;
  const { data } = await supabase
    .from("subscriptions")
    .select("status, interval, current_period_end, cancel_at_period_end, plan_id, stripe_subscription_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LiveSubscription | null) ?? null;
}

async function subscriptionFor(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const sub = await liveSubscription(supabase, userId);
  return sub?.stripe_subscription_id ?? null;
}

async function act(
  userId: string,
  change: (id: string) => Promise<unknown>
): Promise<DuesOutcome> {
  if (!stripeEnabled()) return { kind: "not-wired" };
  let id: string | null = null;
  try {
    id = await subscriptionFor(userId);
  } catch {
    return { kind: "failed", detail: "the dues record could not be read" };
  }
  if (!id) return { kind: "nothing-to-do" };
  try {
    await change(id);
    return { kind: "changed" };
  } catch {
    /* Deliberately no detail from the provider — it is not the member's to
       read, and the caller only needs to know it did not happen. */
    return { kind: "failed", detail: "the card on file was not changed" };
  }
}

/* Stop billing while the MEMBERSHIP is paused. `void` rather than
   `keep_as_draft`: a member coming back should not walk into a stack of
   invoices that all fall due at once, which is the opposite of what pausing a
   membership is for. */
export async function pauseDues(userId: string): Promise<DuesOutcome> {
  return act(userId, (id) =>
    getStripe().subscriptions.update(id, { pause_collection: { behavior: "void" } })
  );
}

export async function resumeDues(userId: string): Promise<DuesOutcome> {
  /* null clears the pause — the documented way to unpause.

     This used to clear `cancel_at_period_end` in the same call, on the reasoning
     that resuming after a change of heart really does resume. But the two flags
     are set by different people for different reasons. A member can end their
     dues themselves in the Stripe billing portal, which sets
     cancel_at_period_end and leaves the subscription `active` — so their
     standing here stays `active` too. If they then paused and resumed in-app,
     that one call quietly un-cancelled the cancellation they had chosen, and
     nothing told them. Restarting billing someone deliberately stopped is not a
     thing to do as a side effect.

     The consequence, stated so it is not discovered later: reinstating someone
     whose dues were already ending does NOT restart them. That is deliberate —
     resuming a membership and re-signing for dues are two decisions, and only
     one of them was made. It is visible rather than silent: the Bridge's member
     drawer renders "ends at period close" straight off the subscription, so the
     operator reinstating them can see it and act. */
  return act(userId, (id) =>
    getStripe().subscriptions.update(id, { pause_collection: null })
  );
}

/* At period end, not immediately: they paid for this month and this month is
   theirs. Cancelling now would take access they have already bought and would
   raise the refund question this deliberately avoids. */
export async function endDuesAtPeriodEnd(userId: string): Promise<DuesOutcome> {
  return act(userId, (id) =>
    getStripe().subscriptions.update(id, { cancel_at_period_end: true })
  );
}

/* One sentence a member can act on, for each outcome. The caller appends it to
   whatever it says about the standing itself. */
export function duesNote(outcome: DuesOutcome, act: "paused" | "resumed" | "departed"): string | null {
  switch (outcome.kind) {
    case "changed":
      return act === "paused"
        ? "Dues stop here — nothing more is taken while your membership is paused."
        : act === "resumed"
          ? "Dues start again on your next cycle."
          : "Your dues end when the period you have paid for runs out. Nothing further is taken.";
    case "nothing-to-do":
      return null;
    /* Both lines name the thing that did not happen rather than letting the
       member assume. They differ on the remedy, and that difference is the
       whole point: `not-wired` means Stripe is switched off in this
       environment — which is exactly the condition under which /account does
       not render a billing-portal button at all. Telling someone to go press a
       button that cannot be there is a dead end dressed as an answer. */
    case "not-wired":
      return "Your standing is set, but the dues on your card were NOT changed — Shoreside settles dues by hand until the processor is live, so hail them and they will stop it.";
    case "failed":
      return "Your standing is set, but the dues on your card were NOT changed — settle that in the billing portal on your account page, or hail Shoreside.";
  }
}
