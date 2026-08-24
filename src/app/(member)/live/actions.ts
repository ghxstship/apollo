"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type GalleyLine = { itemId: string; qty: number };
export type GalleyResult = { error?: string };

/* Member self-order, through place_galley_order.

   This used to insert into galley_orders directly, with the total computed
   here from a price map read a moment earlier. Two things were wrong with it.
   The smaller one is that a member was stating a price — the rule everywhere
   else in this codebase is that they never do. The larger one is that it had
   not worked in some time: galley_orders' INSERT policy is `is_staff()`, so
   every member order was refused by RLS and the member was told "That didn't
   land. Try again." The policy was tightened to force orders through the
   definer and this caller was never moved across.

   The RPC prices the tab from the catalogue, refuses a member who is not
   aboard that sailing, and refuses a membership on hold — each in its own
   words, which now reach the member instead of a generic line. */
export async function placeGalleyOrder(
  voyageId: string,
  lines: GalleyLine[]
): Promise<GalleyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const clean = lines
    .map((l) => ({ itemId: String(l.itemId), qty: Math.round(Number(l.qty)) }))
    .filter((l) => l.itemId && l.qty > 0 && l.qty <= 12);
  if (clean.length === 0) return { error: "Nothing in the order yet." };

  const { error } = await supabase.rpc("place_galley_order", {
    p_voyage: voyageId,
    /* "itemId", camelCase — that is the key jsonb_to_recordset destructures
       inside the RPC, and there is a whole migration named after getting this
       wrong on the shop's twin. */
    p_lines: clean.map((l) => ({ itemId: l.itemId, qty: l.qty })),
  });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/live");
  return {};
}
