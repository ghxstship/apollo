"use server";

import { revalidatePath } from "next/cache";
import { ERR_LAND, ERR_STAFF, staffContext, type ActionResult } from "../../staff";

export type ProposalRuling = "considering" | "approved" | "declined";

/* One motion for every ruling. decide_a_proposal is staff-checked inside,
   writes the status AND posts to the proposer’s Inbox in the same call — the
   member is never ruled on silently. Its refusals arrive in the club's own
   voice, so they pass through verbatim rather than being flattened to a
   generic failure.

   An approval may name the episode it became. The link is written AFTER the
   ruling lands, through the Bridge's update policy, so a ruling never fails on
   account of a link — and a link that does not land is said, not swallowed. */
export async function decideProposal(
  id: string,
  ruling: ProposalRuling,
  note?: string,
  voyageId?: string | null
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

  let linkNote: string | undefined;
  if (ruling === "approved" && voyageId) {
    const { error: linkError } = await supabase
      .from("member_event_proposals")
      .update({ voyage_id: voyageId })
      .eq("id", id);
    if (linkError) {
      linkNote = "Approved and the proposer told, but the episode did not link. Pick it again from the row.";
    }
  }

  revalidatePath("/bridge/proposals");
  /* The member's own page reads the status line off the same row. */
  revalidatePath("/you");
  return linkNote ? { note: linkNote } : {};
}

/* Link (or re-link) an approved proposal to the episode it became. */
export async function linkProposal(id: string, voyageId: string | null): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const { error } = await supabase
    .from("member_event_proposals")
    .update({ voyage_id: voyageId })
    .eq("id", id)
    .eq("status", "approved");
  if (error) return { error: ERR_LAND };
  revalidatePath("/bridge/proposals");
  revalidatePath("/you");
  return {};
}

/* — Private episode requests: an on-request series has a door —

   The table is charter_requests and the catalogue series is still Private
   charter; what a member is asking for, and what they get, is an episode. The
   noun in the copy follows the thing, not the column. —

   Answer and Decline are the two ways off the queue. Both write the status and
   the note, and both put the note in the member's Word. notifications has no
   INSERT policy for anyone — it is definer-write only (20260823012505) — so the
   Word goes through notify_member, the Bridge's one way to reach a member. The
   record is written first; if the notice cannot be sent, the operator is told
   rather than left believing the member heard. */
export type CharterRuling = "answered" | "declined";

export async function decideCharter(
  id: string,
  ruling: CharterRuling,
  note: string
): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };

  const line = note.trim();
  if (ruling === "answered" && !line) {
    return { error: "An answer needs a line — that line is what reaches the member." };
  }

  const { data: request, error: readError } = await supabase
    .from("charter_requests")
    .select("id, profile_id, status, format, party_size")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: ERR_LAND };
  if (!request) return { error: "That request is gone — the member withdrew it." };
  if (request.status !== "submitted") {
    return { error: "Already ruled on. Reload to see the standing answer." };
  }

  const { data: ruled, error } = await supabase
    .from("charter_requests")
    .update({
      status: ruling,
      decision_note: line || null,
      decided_by: staffId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id");
  if (error) return { error: ERR_LAND };
  if (!ruled || ruled.length === 0) {
    return { error: "Somebody ruled on it first. Reload to see the standing answer." };
  }

  const title =
    ruling === "answered"
      ? "The Bridge answered your request for a private episode"
      : "The Bridge passed on your request for a private episode";
  const body = line || "The Bridge passed on this one.";
  const { error: wordError } = await supabase.rpc("notify_member", {
    p_profile: request.profile_id,
    p_kind: "word",
    p_title: title,
    p_body: body,
  });

  revalidatePath("/bridge/proposals");
  revalidatePath("/you");

  if (wordError) {
    return {
      note: "Ruled, but the notice did not reach their Inbox — tell them from Shoreside.",
    };
  }
  return {};
}
