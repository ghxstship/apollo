"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* A tier is a row on the rate card (sponsor_tiers), not a list in this file.
   The slug is validated against the table at write time, so a tier the Bridge
   retires from the card cannot be signed by a stale screen. */
export type SponsorTier = string;

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
   render on the public episode pages — both read at request time through the
   definer, so every activation change has to reach the shore too. */
function done(): ActionResult {
  revalidatePath("/bridge/sponsors");
  revalidatePath("/episodes");
  revalidatePath("/episodes/[slug]", "page");
  return {};
}

/* Ids come off pickers and rows, so one that is not an id is a stale screen.
   The driver's refusal of a malformed uuid was flattened to "didn't land",
   which invites a retry that cannot work; said here as the row, with the fix. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SPONSOR = "That sponsor is not on the book — reload the page.";
const NO_EPISODE = "That episode is not on the chart — reload the page.";
const NAME_MAX = 120;
const PLACEMENT_MAX = 200;
const NOTES_MAX = 2000;
/* monthly_cents is an integer; a retainer past a million a month is a typo
   before it is an overflow, and the overflow says nothing an operator can act on. */
const RETAINER_MAX_DOLLARS = 1_000_000;

/* Shape and calendar both: the dates arrive as strings off <input type="date">,
   which any browser may leave half-typed, and "2026-02-30" is the right shape
   with no day behind it. Either reached the driver and came back "didn't land". */
const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export async function createSponsor(input: NewSponsor): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const name = input.name.trim();
  if (!name) return { error: "A sponsor needs a name — that is the whole credit." };
  if (name.length > NAME_MAX) return { error: `A sponsor's name runs to ${NAME_MAX} characters.` };

  const { data: tierRow, error: tierError } = await supabase
    .from("sponsor_tiers")
    .select("slug")
    .eq("slug", input.tier)
    .maybeSingle();
  if (tierError) return { error: ERR_LAND };
  if (!tierRow) return { error: "Pick a tier off the rate card." };

  const monthly = Math.round(input.monthlyCents);
  if (!Number.isFinite(monthly) || monthly < 0)
    return { error: "The retainer is a dollar figure, zero or better." };
  if (monthly > RETAINER_MAX_DOLLARS * 100)
    return { error: `The retainer runs to ${RETAINER_MAX_DOLLARS.toLocaleString("en-US")} dollars a month — check the figure.` };

  const email = input.contactEmail.trim();
  if (email && !/.+@.+\..+/.test(email))
    return { error: "That contact address won't reach anyone." };

  /* The term may be open at either end; when both ends exist the database
     also refuses a term that ends before it begins — this is the readable
     version of a_retainer_ends_after_it_begins. */
  const startsOn = input.startsOn || null;
  const endsOn = input.endsOn || null;
  if (startsOn && !isDay(startsOn)) return { error: "The term's first day has to be a real day on the calendar." };
  if (endsOn && !isDay(endsOn)) return { error: "The term's last day has to be a real day on the calendar." };
  if (startsOn && endsOn && endsOn < startsOn)
    return { error: "A term has to end after it begins." };

  const { error } = await supabase.from("sponsors").insert({
    name,
    tier: input.tier as "presenting_partner" | "sandbar_hub" | "confessional_pod" | "shore_leave_partner",
    monthly_cents: monthly,
    contact_email: email || null,
    starts_on: startsOn,
    ends_on: endsOn,
    notes: input.notes.trim().slice(0, NOTES_MAX) || null,
    /* The column defaults to auth.uid(); stated so the row says who signed
       them even if a future default changes. */
    created_by: staffId,
  });
  if (error) {
    /* The tier was read a moment ago; a card retired between the read and
       the write is the one foreign key left to fire. */
    return { error: error.code === "23503" ? "That tier has come off the rate card — pick another." : ERR_LAND };
  }
  return done();
}

/* Retire and reinstate. A retired sponsor keeps its rows — the terms are the
   record — but sponsor_credits() reads only active names, so the shore stops
   crediting it the moment this lands. */
export async function setSponsorActive(id: string, active: boolean): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(id)) return { error: NO_SPONSOR };
  const { data, error } = await supabase.from("sponsors").update({ active }).eq("id", id).select("id");
  if (error) return { error: ERR_LAND };
  /* A sponsor struck by another operator is still a row on this screen until
     it reloads; the update lands on nothing and Postgres calls that success. */
  if (!data?.length) return { error: NO_SPONSOR };
  return done();
}

/* Activation: the join row is what puts a name on an episode. Placement is a
   note for the crew — where the asset actually sits — not public copy. */
export async function attachSponsor(
  episodeId: string,
  sponsorId: string,
  placement: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!episodeId) return { error: "Pick the episode it rides on." };
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (!UUID.test(sponsorId)) return { error: NO_SPONSOR };

  const { error } = await supabase.from("episode_sponsors").insert({
    episode_id: episodeId,
    sponsor_id: sponsorId,
    placement: placement.trim().slice(0, PLACEMENT_MAX) || null,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: "Already placed on that episode." };
    /* Two foreign keys; the message names the pair rather than guessing. */
    if (error.code === "23503") return { error: "That episode or sponsor is no longer on the books — reload the page." };
    return { error: ERR_LAND };
  }
  return done();
}

export async function detachSponsor(episodeId: string, sponsorId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (!UUID.test(sponsorId)) return { error: NO_SPONSOR };
  const { data, error } = await supabase
    .from("episode_sponsors")
    .delete()
    .eq("episode_id", episodeId)
    .eq("sponsor_id", sponsorId)
    .select("episode_id");
  if (error) return { error: ERR_LAND };
  if (!data?.length) return { error: "That activation was already taken down — reload the page." };
  return done();
}

/* What the activation has actually handed over, against what the tier
   promises. episode_sponsors.assets_delivered is the ticked list; the
   checklist itself is sponsor_tiers.assets for the sponsor's tier, read here
   so a stale screen cannot record an asset the card no longer carries. */
export async function setAssetsDelivered(
  episodeId: string,
  sponsorId: string,
  delivered: string[]
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (!UUID.test(sponsorId)) return { error: NO_SPONSOR };

  const { data: sponsor, error: sponsorError } = await supabase
    .from("sponsors")
    .select("tier")
    .eq("id", sponsorId)
    .maybeSingle();
  if (sponsorError) return { error: ERR_LAND };
  if (!sponsor) return { error: "That sponsor is not on the book." };

  const { data: tierRow, error: tierError } = await supabase
    .from("sponsor_tiers")
    .select("assets")
    .eq("slug", sponsor.tier)
    .maybeSingle();
  if (tierError) return { error: ERR_LAND };
  const owed = new Set(tierRow?.assets ?? []);
  const kept = [...new Set(delivered)].filter((a) => owed.has(a));

  const { data: updated, error } = await supabase
    .from("episode_sponsors")
    .update({ assets_delivered: kept })
    .eq("episode_id", episodeId)
    .eq("sponsor_id", sponsorId)
    .select("episode_id");
  if (error) return { error: ERR_LAND };
  if (!updated?.length) {
    return { error: "That sponsor is not on this episode — place the activation first." };
  }
  return done();
}

/* A complimentary pass on the sponsor's account. comp_a_pass_for_sponsor is
   staff-checked inside and refuses unless the sponsor is placed on that
   sailing — "that sponsor is not on this sailing — place the activation
   first" — so the refusal already names the way out and passes as said. */
export async function compAPass(
  episodeId: string,
  sponsorId: string,
  profileId: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  if (!profileId) return { error: "Pick the member the pass is for." };
  if (!UUID.test(profileId)) return { error: "Pick the member off the list." };
  if (!UUID.test(episodeId)) return { error: NO_EPISODE };
  if (!UUID.test(sponsorId)) return { error: NO_SPONSOR };

  const { error } = await supabase.rpc("comp_a_pass_for_sponsor", {
    p_episode: episodeId,
    p_sponsor: sponsorId,
    p_profile: profileId,
  });
  if (error) return { error: voice(error) };
  /* A comp is a pass, so the manifest for that episode moved too. */
  revalidatePath("/bridge/manifests");
  return done();
}
