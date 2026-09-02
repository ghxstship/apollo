"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REFUSED_MESSAGE, voiceWith } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import { DRINKS, isSegment, type Segment, type Stance } from "@/lib/vetting";
import { isPartnerName } from "./partner";

/* Vetting — the member's side of the funnel.

   Every refusal here goes through voiceWith rather than voice. An RLS refusal
   from Postgres is "new row violates row-level security policy", which tells a
   member nothing, and voice() alone answers it with a message that is true and
   useless; voiceWith asks is_active() and says the true thing either way. The
   difference matters most on this surface, because a paused member and a member
   who is simply not cleared are two completely different problems with the same
   error code.

   Nothing below decides anything. The caps, the head count, the clearance and
   the six hours are all trigger and RPC decisions — see guard_the_ratio,
   guard_the_vetting and claim_your_place. These functions carry the answer back
   in the club's voice and revalidate the page. */

export type VettingResult = { error?: string; ok?: true };

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, db: moduleTables(supabase), user };
}

/* Part 1 of the Preference Sheet. The list is bounded to the sheet's own
   options rather than passed through: this arrives from a client component and
   `drinks` is a text[] the bar stocks against, not a free-text field. */
export async function saveDrinks(drinks: string[]): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  const clean = [...new Set(drinks)].filter((d) => (DRINKS as readonly string[]).includes(d));
  const { error } = await db
    .from("preference_sheets")
    .upsert({ profile_id: user.id, drinks: clean, updated_at: new Date().toISOString() });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  return { ok: true };
}

/* Part 3. 200 characters each, matching the check constraint — bounded here as
   well so a member who overruns is told by the form rather than by a constraint
   violation the error voice has to guess at. */
export async function saveFlags(green: string, red: string): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };
  if (green.length > 200 || red.length > 200) {
    return { error: "Two hundred characters each — trim one and try again." };
  }

  const { error } = await db.from("preference_sheets").upsert({
    profile_id: user.id,
    flag_green: green.trim() || null,
    flag_red: red.trim() || null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  return { ok: true };
}

/* Part 2. One row per topic, upserted, because a boundary is a standing answer
   and not an event log — a member who moves "Being photographed" from HAPPY TO
   to NEVER has one answer, and the crew must never read the old one.

   The "photographed" topic is the Confessional Pod's blur flag. Setting it to
   NEVER here is what makes blur_is_required() true, and nothing on a crew tablet
   can lower it afterwards. */
export async function setBoundary(topic: string, stance: Stance): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  const { error } = await db
    .from("preference_boundaries")
    .upsert({ profile_id: user.id, topic, stance, updated_at: new Date().toISOString() });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  revalidatePath("/show");
  return { ok: true };
}

/* Taking a seat. This is a plain insert into `rsvps` and that is the point: the
   ratio gate and the vetting gate are triggers on that table, so the same rules
   apply to this call, to a staff booking, and to a curl request against
   PostgREST. There is no path that reaches the manifest without passing them. */
export async function takeASeat(
  voyageId: string,
  segment: string,
  partnerName?: string
): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };
  if (!isSegment(segment)) return { error: "Pick a seat first." };

  /* A couple is one row and two heads, and the second head is a person with a
     name, a boarding code and a waiver of their own. The seat is not taken
     until the name is there — taking it first and asking afterwards would
     leave a two-head pass with one head on the manifest. */
  const partner = (partnerName ?? "").trim();
  if (segment === "couple" && !isPartnerName(partner)) {
    return { error: "A couple pass names its second head — two to eighty characters." };
  }

  const { data: seat, error } = await db
    .from("rsvps")
    .insert({ voyage_id: voyageId, profile_id: user.id, status: "aboard", segment })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|already exists/i.test(error.message ?? "")) {
      return { error: "You are already on this manifest." };
    }
    /* The triggers raise in the club's voice and say more than a generic line
       can — which segment is full and how many seats it had, that the clearance
       has lapsed and when, that this episode seats by segment. Those messages
       reach a member verbatim by design, so they are passed through. Only a
       bare RLS refusal, which says nothing, gets a substitute. */
    const said = await voiceWith(supabase, error);
    return {
      error:
        said === REFUSED_MESSAGE
          ? "Passes open to cleared members in good standing."
          : said,
    };
  }

  /* The second head rides the guest machinery — its own rsvp_guests row, kind
     'partner', which the manifest cuts a boarding code and a sign token for.
     It never counts as a guest and guest-name edits never prune it; the
     database refuses a partner on a non-couple pass, and that refusal is
     passed through in its own words. */
  if (segment === "couple" && seat) {
    const { error: headError } = await supabase
      .from("rsvp_guests")
      .insert({ rsvp_id: seat.id, name: partner, kind: "partner" });
    if (headError) {
      revalidatePath("/vetting");
      revalidatePath("/passes");
      /* The seat stands — the insert above committed. Say so, say what did
         not land, and name the way out. */
      return {
        error: `Your seat is taken, but the second head did not land — ${await voiceWith(
          supabase,
          headError
        )} Shoreside can add them to the pass.`,
      };
    }
  }

  revalidatePath("/vetting");
  revalidatePath("/passes");
  return { ok: true };
}

/* A full segment offers the waitlist, never an upsell to another segment. That
   rule is the reason this function takes the segment the member asked for and
   has no parameter that could carry a different one. */
export async function joinTheLine(voyageId: string, segment: string): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };
  if (!isSegment(segment)) return { error: "Pick a seat first." };

  /* `place` is omitted deliberately: number_the_waitlist assigns it under an
     advisory lock. A position sent from a browser is a position two members
     refreshing the same full episode would both compute. */
  const { error } = await db
    .from("waitlist_entries")
    .insert({ voyage_id: voyageId, profile_id: user.id, segment: segment as Segment });
  if (error) {
    if (/duplicate|already exists/i.test(error.message ?? "")) {
      return { error: "You are already in this line." };
    }
    return { error: await voiceWith(supabase, error) };
  }
  revalidatePath("/vetting");
  return { ok: true };
}

/* The six-hour claim. Through the RPC, because claiming means inserting a pass
   and both have to succeed or neither: if the composition moved while the offer
   was out, the claim rolls back rather than recording a seat the manifest does
   not have. */
export async function claimYourPlace(entryId: string): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  const { error } = await db.rpc("claim_your_place", { p_entry: entryId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  revalidatePath("/passes");
  return { ok: true };
}

export async function leaveTheLine(entryId: string): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };

  /* The result is checked rather than discarded. The DELETE policy is a plain
     ownership test today, so this works — but a swallowed error means the day
     that policy is tightened this reports success while the member stays in a
     line they think they left, and finds out when the club writes to them. */
  const { error } = await db
    .from("waitlist_entries")
    .delete()
    .eq("id", entryId)
    .eq("profile_id", user.id);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  return { ok: true };
}

/* The other end of the line, for the crew.

   Without this the waitlist was write-only: a member could join it and nothing
   in the product could ever offer them the seat, because offer_the_next_place
   existed as an RPC with no caller. A queue nobody can serve is worse than no
   queue — it takes a member's expectation and holds it.

   The RPC is staff-only and checks the room exists before it promises it, so
   the button cannot write to somebody once and then refuse them at the gate six
   hours later. */
export async function offerTheNextPlace(voyageId: string, segment: string): Promise<VettingResult> {
  const { supabase, db, user } = await me();
  if (!user) return { error: "Sign in first." };
  const { data: staff } = await supabase.rpc("is_staff");
  if (!staff) return { error: "Offering the next place is the Bridge's to do." };
  if (!isSegment(segment)) return { error: "Pick a segment first." };

  const { error } = await db.rpc("offer_the_next_place", { p_voyage: voyageId, p_segment: segment });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/vetting");
  /* The Bridge's Composition screen calls this same function against an episode
     the member page may not be showing — /vetting only ever renders the SOONEST
     gated episode, so a crew member working the line for a later one could
     offer a seat and watch the queue in front of them not move. One offer
     function, both surfaces revalidated. */
  revalidatePath("/bridge/composition");
  return { ok: true };
}
