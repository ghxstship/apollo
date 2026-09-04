"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type ContestShape = "regatta" | "challenge";
export type ContestScope = "member" | "crew";
export type ContestMetric = "nm" | "episodes" | "cities" | "vessels" | "crew_met" | "frames";

export type NewContest = {
  title: string;
  slug: string;
  blurb: string;
  shape: ContestShape;
  scope: ContestScope;
  /** Required when scope is crew — crew_scope_has_voyage is a check constraint. */
  episodeId: string | null;
  metric: ContestMetric;
  target: number;
  prize: string;
  knotsAward: number;
  startsAt: string;
  endsAt: string;
};

function done(): ActionResult {
  revalidatePath("/bridge/regattas");
  revalidatePath("/regattas");
  return {};
}

/* contests.shape, .scope and .metric are check constraints on exactly these
   values (metric was renamed 20260902191028 — sailings became episodes,
   harbors became cities). Refused here in words before the database refuses
   them by constraint name. knots_award and target are integer columns. */
const SHAPES: readonly ContestShape[] = ["regatta", "challenge"];
const SCOPES: readonly ContestScope[] = ["member", "crew"];
const METRICS: readonly ContestMetric[] = ["nm", "episodes", "cities", "vessels", "crew_met", "frames"];
const TITLE_MAX = 120;
const BLURB_MAX = 300;
const PRIZE_MAX = 200;
const TARGET_MAX = 1_000_000;
const AWARD_MAX = 1_000_000;

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createContest(input: NewContest): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const title = input.title.trim();
  if (!title) return { error: "A contest needs a name." };
  if (title.length > TITLE_MAX) return { error: `A contest's name runs to ${TITLE_MAX} characters.` };
  if (!SHAPES.includes(input.shape)) return { error: "A contest is a regatta or a challenge." };
  if (!SCOPES.includes(input.scope)) return { error: "A contest is for members or for one episode's crew." };
  if (!METRICS.includes(input.metric)) return { error: "That is not a thing the club measures." };
  if (!Number.isFinite(input.knotsAward) || input.knotsAward < 0 || input.knotsAward > AWARD_MAX)
    return { error: `A knots award runs 0 to ${AWARD_MAX.toLocaleString("en-US")}.` };
  if (input.shape === "challenge" && (!Number.isFinite(input.target) || input.target > TARGET_MAX))
    return { error: `A target runs 1 to ${TARGET_MAX.toLocaleString("en-US")}.` };

  const slug = slugify(input.slug || title);
  if (!slug) return { error: "That name leaves no address behind it." };

  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()))
    return { error: "Both dates are needed." };
  if (ends <= starts) return { error: "It has to close after it opens." };

  /* A challenge without a target has nothing to measure against; the database
     enforces this too, but the message here is the readable one. */
  if (input.shape === "challenge" && (!input.target || input.target < 1))
    return { error: "A challenge needs a number to reach." };

  /* Crew scope was complete server-side long before this composer could send
     it: the check constraint (crew_scope_has_voyage) requires the episode, and
     the "enter yourself" policy on contest_entries already admits only that
     episode's aboard passes. As with the target, the database enforces this
     too; the message here is the readable one. */
  if (input.scope === "crew" && !input.episodeId)
    return { error: "A crew contest runs on one episode — pick it first." };

  const { error } = await supabase.from("contests").insert({
    slug,
    title,
    blurb: input.blurb.trim().slice(0, BLURB_MAX) || null,
    shape: input.shape,
    scope: input.scope,
    episode_id: input.scope === "crew" ? input.episodeId : null,
    metric: input.metric,
    target: input.shape === "challenge" ? Math.round(input.target) : null,
    prize: input.prize.trim().slice(0, PRIZE_MAX) || null,
    knots_award: Math.max(0, Math.round(input.knotsAward)),
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    status: "draft",
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "That address is taken by another contest."
        : ERR_LAND,
    };
  }
  return done();
}

/* Draft to open: the moment members can see it and enter. */
export async function openContest(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("contests")
    .update({ status: "open" })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { error: ERR_LAND };
  return done();
}

/* Settle freezes the standing into contest_results, pays the award, notifies
   everyone who entered, and closes the book. The RPC is staff-gated and refuses
   to run twice. */
export async function settleContest(id: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { error } = await supabase.rpc("settle_contest", { p_contest_id: id });
  if (error) {
    if (/already settled/i.test(error.message)) return { error: "That one is already settled." };
    if (/not open/i.test(error.message)) return { error: "Open it before settling it." };
    return { error: ERR_LAND };
  }
  return done();
}
