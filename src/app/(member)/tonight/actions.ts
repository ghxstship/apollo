"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REFUSED_MESSAGE, voiceWith } from "@/lib/errors";

/* [un] Scripted. A seat is claimed through the RPC — the fifteen-minute hold
   and the capacity race live at the database, so two people reaching for the
   last chair resolves honestly. Picks are plain inserts; RLS is the whole rule:
   your own chair, a confirmed seatmate, and only after the night has started. */

export type SeatResult = { error?: string; heldUntil?: string };

export async function claimSeat(tableId: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data, error } = await supabase.rpc("claim_table_seat", { p_table: tableId });
  /* The RPC already refuses in the club's voice, and says more than a generic
     line can — which table is full and how many seats it had, that the night
     is not one you are booked on, that your membership is on hold. An
     allow-list of two regexes threw all of that away. */
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/tonight");
  return { heldUntil: typeof data === "string" ? data : undefined };
}

export async function confirmSeat(tableId: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("confirm_table_seat", { p_table: tableId });
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/tonight");
  return {};
}

export async function releaseSeat(tableId: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* The result was discarded entirely. Today the DELETE policy is a plain
     ownership check with no trigger, so it works — but a swallowed error means
     the day that policy is tightened, this reports success while the seat stays
     taken, and the member finds out at the door. */
  const { error } = await supabase
    .from("table_seats")
    .delete()
    .eq("table_id", tableId)
    .eq("profile_id", user.id);
  if (error) return { error: await voiceWith(supabase, error) };
  revalidatePath("/tonight");
  return {};
}

/* The pick is private — not even your seatmates see it. Mutuality is the only
   thing that ever surfaces, by trigger.

   `again` rides on the same row: "I would sit near them again" is a hint to
   the Bridge for the next seating — not a match, never shown to members — and
   the Bridge's Tonight screen has counted it since it shipped. No member
   surface ever wrote it, so the count read zero on every night. It is set at
   the pick, by the picker, and never rewritten: table_picks carries no UPDATE
   policy, which is the rule the harness pins. */
export async function pickFromTable(
  tableId: string,
  picked: string,
  again = false
): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (picked === user.id) return { error: "That is you." };

  const { error } = await supabase
    .from("table_picks")
    .insert({ table_id: tableId, picker: user.id, picked, again: again === true });
  if (error) {
    if (/duplicate/i.test(error.message)) return {};
    /* This returned that one sentence for EVERY error, including an RLS refusal
       on a held membership — the confidently-wrong message lib/errors.ts exists
       to eliminate. The specific line is still right when it is right, so it
       stays as the fallback rather than the answer. */
    const said = await voiceWith(supabase, error);
    return {
      error:
        said === REFUSED_MESSAGE
          ? "Picks open once the night has started, from a confirmed seat."
          : said,
    };
  }
  revalidatePath("/tonight");
  revalidatePath("/matches");
  return {};
}
