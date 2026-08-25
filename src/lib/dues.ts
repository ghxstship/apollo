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

   A NOTE ON THE WORD "HOLD". A WEATHER HOLD is a SAILING paused for conditions
   (voyages.status = 'weather_hold'), called by 18:00 the night before, and it
   is what the `weather` notification preference governs. Nothing in this file
   has anything to do with it.

   Every "held" below is a MEMBERSHIP held — profiles.status = 'paused', set by
   the member through set_own_standing. The membership state used to be dressed
   in the weather-hold metaphor across the app; it no longer is, because the two
   share no column, no trigger and no preference, and putting both on one screen
   under one phrase told members nothing.

   The rules, stated once here so the copy and the code cannot drift:

     MEMBERSHIP HELD    collection pauses. Nothing is refunded for the period
                        already paid — they are simply not billed again while
                        the membership is held.
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

async function subscriptionFor(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("profile_id", userId)
    .not("stripe_subscription_id", "is", null)
    .in("status", ["active", "trialing", "past_due", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.stripe_subscription_id ?? null;
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

/* Stop billing while the MEMBERSHIP is held. `void` rather than
   `keep_as_draft`: a member coming back should not walk into a stack of
   invoices that all fall due at once, which is the opposite of what holding a
   membership is for. */
export async function pauseDues(userId: string): Promise<DuesOutcome> {
  return act(userId, (id) =>
    getStripe().subscriptions.update(id, { pause_collection: { behavior: "void" } })
  );
}

export async function resumeDues(userId: string): Promise<DuesOutcome> {
  return act(userId, (id) =>
    /* null clears it — the documented way to unpause. Also clears any pending
       cancellation, so resuming after a change of heart really does resume. */
    getStripe().subscriptions.update(id, { pause_collection: null, cancel_at_period_end: false })
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
export function duesNote(outcome: DuesOutcome, act: "held" | "resumed" | "departed"): string | null {
  switch (outcome.kind) {
    case "changed":
      return act === "held"
        ? "Dues stop here — nothing more is taken while your membership is held."
        : act === "resumed"
          ? "Dues start again on your next cycle."
          : "Your dues end when the period you have paid for runs out. Nothing further is taken.";
    case "nothing-to-do":
      return null;
    case "not-wired":
    case "failed":
      /* The honest line. It names the thing that did not happen and where to
         get it done, rather than letting the member assume. */
      return "Your standing is set, but the dues on your card were NOT changed — settle that in the billing portal on your account page, or hail Shoreside.";
  }
}
