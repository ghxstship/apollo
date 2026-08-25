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
  if (error) return { error: voice(error) };
  return done();
}

/* Removing every cap row un-gates the sailing: guard_the_ratio and
   guard_the_vetting both return early when a sailing carries no composition, so
   this is a real change to who may board and not a tidy-up. Confirmed at the
   surface, and refused outright while anyone is standing in the line, because
   the line is only meaningful against a ceiling. */
export async function liftTheComposition(voyageId: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const db = moduleTables(supabase);

  const { data: waiting, error: readError } = await db
    .from("waitlist_entries")
    .select("id")
    .eq("voyage_id", voyageId)
    .is("claimed_at", null)
    .is("released_at", null);
  if (readError) return { error: voice(readError) };
  if ((waiting ?? []).length > 0) {
    return {
      error: `${(waiting ?? []).length} in the line for this sailing. Serve them or let them go before you lift the composition.`,
    };
  }

  const { error } = await db.from("voyage_segment_caps").delete().eq("voyage_id", voyageId);
  if (error) return { error: voice(error) };
  return done();
}
