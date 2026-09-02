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
    blurb: input.blurb.trim() || null,
    shape: input.shape,
    scope: input.scope,
    episode_id: input.scope === "crew" ? input.episodeId : null,
    metric: input.metric,
    target: input.shape === "challenge" ? Math.round(input.target) : null,
    prize: input.prize.trim() || null,
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
