"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* Syrius Dating. A seat is claimed through the RPC — the fifteen-minute hold
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
  if (error) {
    if (/full/i.test(error.message)) return { error: "That table is full. Try the next one." };
    return { error: "That didn't land. Try again." };
  }
  revalidatePath("/tables");
  return { heldUntil: typeof data === "string" ? data : undefined };
}

export async function confirmSeat(tableId: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("confirm_table_seat", { p_table: tableId });
  if (error) {
    if (/lapsed/i.test(error.message))
      return { error: "The hold lapsed. Claim the seat again." };
    return { error: "That didn't land. Try again." };
  }
  revalidatePath("/tables");
  return {};
}

export async function releaseSeat(tableId: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  await supabase
    .from("table_seats")
    .delete()
    .eq("table_id", tableId)
    .eq("profile_id", user.id);
  revalidatePath("/tables");
  return {};
}

/* The pick is private — not even your seatmates see it. Mutuality is the only
   thing that ever surfaces, by trigger. */
export async function pickFromTable(tableId: string, picked: string): Promise<SeatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (picked === user.id) return { error: "Not yourself." };

  const { error } = await supabase
    .from("table_picks")
    .insert({ table_id: tableId, picker: user.id, picked });
  if (error) {
    if (/duplicate/i.test(error.message)) return {};
    return { error: "Picks open once the night has started, from a confirmed seat." };
  }
  revalidatePath("/tables");
  revalidatePath("/matches");
  return {};
}
