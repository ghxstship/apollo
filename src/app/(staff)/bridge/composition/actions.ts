"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { moduleTables } from "@/lib/module-tables";
import { SEGMENTS, type Segment } from "@/lib/vetting";
import { staffContext, ERR_STAFF, type ActionResult } from "../../staff";

/* The composition — the three segment ceilings a sailing seats to.

   voyage_segment_caps had no writer anywhere in src/, and the presence of rows
   in it is what makes a sailing ratio-gated: guard_the_ratio returns early when
   there are none, guard_the_vetting returns early when there are none, and the
   member's capacity panel — the only host for takeASeat, joinTheLine,
   claimYourPlace, leaveTheLine and the crew's offerTheNextPlace — renders only
   when the capacity view hands back rows. With the table empty, every member
   read "Nothing seats by segment yet" and all five controls were unreachable.

   So this screen is not a preference pane. Writing a composition here is what
   turns the ratio gate and the vetting gate ON for a sailing, and taking it off
   is what turns them off. The copy on the screen says so in those words. */

export type CapInput = Record<Segment, number>;

function done(): ActionResult {
  revalidatePath("/bridge/composition");
  revalidatePath("/vetting");
  revalidatePath("/charters");
  return {};
}

/* Clamped to the hull rather than to an arbitrary ceiling: a cap the boat
   cannot carry is a promise guard_the_ratio will refuse at checkout, which is
   the worst possible place to find out. 96 is the same bound setBerthsTotal
   uses when there is no hull figure to clamp against. */
export async function setTheComposition(
  voyageId: string,
  caps: CapInput
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const rows = SEGMENTS.map((segment) => ({
    voyage_id: voyageId,
    segment,
    cap: Math.max(0, Math.min(96, Math.round(Number(caps[segment]) || 0))),
  }));

  if (rows.every((r) => r.cap === 0)) {
    return {
      error:
        "Three ceilings of nought is a sailing nobody can board. Set the seats, or take the composition off.",
    };
  }

  const { error } = await db
    .from("voyage_segment_caps")
    .upsert(rows, { onConflict: "voyage_id,segment" });
  /* the_hull_holds_forty refuses in the club's voice — "the hull holds 40 —
     this composition seats 44 heads" — naming both figures, which is the
     whole of what the operator needs. voice() passes it through as said. */
  if (error) return { error: voice(error) };
  return done();
}

/* The hull's certified heads, per sailing. A flotilla is certified for so many
   people and the_hull_holds_forty reads coalesce(voyages.hull_ceiling_heads,
   club_setting('hull_ceiling_heads')) before it lets a composition stand, so
   this is the number the ceilings above are checked against. Null hands the
   sailing back to the club default.

   1–400: a "use server" module exports only async functions, so the bounds
   are stated here and again on the input in composition-client.tsx. */
const HULL_CEILING_MIN = 1;
const HULL_CEILING_MAX = 400;

export async function setHullCeiling(
  voyageId: string,
  heads: number | null
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  let value: number | null = null;
  if (heads !== null) {
    if (!Number.isFinite(heads) || !Number.isInteger(heads)) {
      return { error: "The hull is certified for a whole number of heads." };
    }
    if (heads < HULL_CEILING_MIN || heads > HULL_CEILING_MAX) {
      return {
        error: `A hull ceiling runs from ${HULL_CEILING_MIN} to ${HULL_CEILING_MAX} heads. Leave it blank to read the club default.`,
      };
    }
    value = heads;
  }

  const { error } = await supabase
    .from("voyages")
    .update({ hull_ceiling_heads: value })
    .eq("id", voyageId);
  /* A ceiling lowered under a composition already seated meets the same
     trigger, and its refusal is the one to show. */
  if (error) return { error: voice(error) };
  return done();
}

/* Removing every cap row un-gates the sailing: guard_the_ratio and
   guard_the_vetting both return early when a sailing carries no composition, so
   this is a real change to who may board and not a tidy-up.

   This used to refuse outright while anyone stood in the line — "serve them or
   let them go" — and NEITHER was reachable. The Offer button renders only when
   a segment has room, so a full segment (the only kind that grows a queue) can
   never serve anyone; and the sole delete path, leaveTheLine, is scoped to the
   member's own row, so no crew surface could let them go. A sailing with a full
   segment and one person waiting could never have its composition lifted again.
   The RLS policy always permitted staff to release them; the control was simply
   missing.

   So lifting now releases the line as part of the same act, which is what
   lifting means: the ceilings are gone, and a queue against a ceiling that no
   longer exists is not a queue. The count is returned so the surface can say
   plainly how many people were let go rather than doing it silently. */
export async function liftTheComposition(voyageId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const { data: released, error: releaseError } = await db
    .from("waitlist_entries")
    .update({ released_at: new Date().toISOString() })
    .eq("voyage_id", voyageId)
    .is("claimed_at", null)
    .is("released_at", null)
    .select("id");
  if (releaseError) return { error: voice(releaseError) };

  const { error } = await db.from("voyage_segment_caps").delete().eq("voyage_id", voyageId);
  if (error) return { error: voice(error) };
  const letGo = (released ?? []).length;
  return letGo > 0
    ? { ...done(), note: `${letGo} released from the line — the ceilings they were waiting on are gone.` }
    : done();
}
