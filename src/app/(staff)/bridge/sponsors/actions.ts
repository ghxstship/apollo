"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type SponsorTier =
  | "presenting_partner"
  | "sandbar_hub"
  | "confessional_pod"
  | "shore_leave_partner";

export type NewSponsor = {
  name: string;
  tier: SponsorTier;
  /** The agreed retainer — the rate card is an opening figure, not a law. */
  monthlyCents: number;
  contactEmail: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

/* The book lives on the Bridge, but the credit line and the venue register
   render on the public sailing pages — both read at request time through the
   definer, so every activation change has to reach the shore too. */
function done(): ActionResult {
  revalidatePath("/bridge/sponsors");
  revalidatePath("/charters");
  revalidatePath("/charters/[slug]", "page");
  return {};
}

const TIERS: SponsorTier[] = [
  "presenting_partner",
  "sandbar_hub",
  "confessional_pod",
  "shore_leave_partner",
];

export async function createSponsor(input: NewSponsor): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = input.name.trim();
  if (!name) return { error: "A sponsor needs a name — that is the whole credit." };

  if (!TIERS.includes(input.tier)) return { error: "Pick a tier off the rate card." };

  const monthly = Math.round(input.monthlyCents);
  if (!Number.isFinite(monthly) || monthly < 0)
    return { error: "The retainer is a dollar figure, zero or better." };

  const email = input.contactEmail.trim();
  if (email && !/.+@.+\..+/.test(email))
    return { error: "That contact address won't reach anyone." };

  /* The term may be open at either end; when both ends exist the database
     also refuses a term that ends before it begins — this is the readable
     version of a_retainer_ends_after_it_begins. */
  const startsOn = input.startsOn || null;
  const endsOn = input.endsOn || null;
  if (startsOn && endsOn && endsOn < startsOn)
    return { error: "A term has to end after it begins." };

  const { error } = await supabase.from("sponsors").insert({
    name,
    tier: input.tier,
    monthly_cents: monthly,
    contact_email: email || null,
    starts_on: startsOn,
    ends_on: endsOn,
    notes: input.notes.trim() || null,
  });
  if (error) return { error: ERR_LAND };
  return done();
}

/* Retire and reinstate. A retired sponsor keeps its rows — the terms are the
   record — but sponsor_credits() reads only active names, so the shore stops
   crediting it the moment this lands. */
export async function setSponsorActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase.from("sponsors").update({ active }).eq("id", id);
  if (error) return { error: ERR_LAND };
  return done();
}

/* Activation: the join row is what puts a name on a sailing. Placement is a
   note for the crew — where the asset actually sits — not public copy. */
export async function attachSponsor(
  voyageId: string,
  sponsorId: string,
  placement: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!voyageId) return { error: "Pick the sailing it rides on." };

  const { error } = await supabase.from("voyage_sponsors").insert({
    voyage_id: voyageId,
    sponsor_id: sponsorId,
    placement: placement.trim() || null,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Already placed on that sailing."
        : ERR_LAND,
    };
  }
  return done();
}

export async function detachSponsor(voyageId: string, sponsorId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("voyage_sponsors")
    .delete()
    .eq("voyage_id", voyageId)
    .eq("sponsor_id", sponsorId);
  if (error) return { error: ERR_LAND };
  return done();
}
