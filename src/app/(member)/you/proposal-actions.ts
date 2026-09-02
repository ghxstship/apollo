"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/* — Raise a gathering: a member puts an event on the Bridge's desk —

   The table takes the proposal; the ruling comes back through
   decide_a_proposal on the Bridge side. A member can withdraw their own
   proposal only while it still reads SUBMITTED — once the Bridge picks it up,
   the record is theirs to rule on. */

/* `field` names the control an error belongs to. Without it the form pinned
   every message — a paused membership, a note over length — to the title box
   as aria-invalid, which told a reader the name was wrong when it was not. A
   message with no field is the form's, and reads at form level. */
export type ProposalFormState = {
  raised?: boolean;
  error?: string;
  field?: "title" | "note";
};

/* A "use server" file may export only async functions, so the caps live here
   as plain consts and again in raise-a-gathering.tsx as the form's maxLength —
   the check constraint on the table is the one that cannot drift. */
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const NOTE_MAX = 2000;

/* The two shapes a member can raise. Their labels come off series;
   this set is the guard on what the form may send. */
const MEMBER_SERIES = new Set(["gathering", "mixer"]);

export async function raiseAProposal(
  _prev: ProposalFormState,
  formData: FormData
): Promise<ProposalFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const title = String(formData.get("title") ?? "").trim();
  const series = String(formData.get("series") ?? "");
  const proposedFor = String(formData.get("proposed_for") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (title.length < TITLE_MIN) {
    return { error: "Give it a name — three characters at least.", field: "title" };
  }
  if (title.length > TITLE_MAX) {
    return { error: `Keep the name under ${TITLE_MAX} characters.`, field: "title" };
  }
  if (note.length > NOTE_MAX) {
    return { error: `Keep the case under ${NOTE_MAX} characters.`, field: "note" };
  }

  const { error } = await supabase.from("member_event_proposals").insert({
    proposer_id: user.id,
    title,
    series: MEMBER_SERIES.has(series) ? series : null,
    proposed_for: /^\d{4}-\d{2}-\d{2}$/.test(proposedFor) ? proposedFor : null,
    note: note || null,
  });

  /* voiceWith says the true thing when RLS refuses — a paused membership is
     the common cause here, and the member is told so rather than guessed at. */
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/you");
  return { raised: true };
}

export async function withdrawProposal(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* RLS lets a member delete their own proposal only while it is submitted. A
     refused delete is not an error to PostgREST — it just touches no rows — so
     the count is the only honest way to know whether anything moved. */
  const { error, count } = await supabase
    .from("member_event_proposals")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("proposer_id", user.id)
    .eq("status", "submitted");

  if (error) return { error: await voiceWith(supabase, error) };
  if (!count) {
    return {
      error:
        "The Bridge already has this one in hand, so it cannot be withdrawn here. Their ruling comes to you as a word.",
    };
  }

  revalidatePath("/you");
  return {};
}
