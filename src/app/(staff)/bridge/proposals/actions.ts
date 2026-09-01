"use server";

import { revalidatePath } from "next/cache";
import { ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type ProposalRuling = "considering" | "approved" | "declined";

/* One motion for every ruling. decide_a_proposal is staff-checked inside,
   writes the status AND sends the Word to the proposer in the same call — the
   member is never ruled on silently. Its refusals arrive in the club's own
   voice, so they pass through verbatim rather than being flattened to a
   generic failure. */
export async function decideProposal(
  id: string,
  ruling: ProposalRuling,
  note?: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const { error } = await supabase.rpc("decide_a_proposal", {
    p_id: id,
    p_status: ruling,
    p_note: note?.trim() || null,
  });
  if (error) {
    return { error: error.message?.trim() || "That didn't land. Try again." };
  }

  revalidatePath("/bridge/proposals");
  /* The member's own page reads the status line off the same row. */
  revalidatePath("/you");
  return {};
}
