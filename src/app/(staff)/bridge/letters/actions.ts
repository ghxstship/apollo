"use server";

import { revalidatePath } from "next/cache";
import { voice } from "@/lib/errors";
import { ERR_STAFF, staffContext, type ActionResult } from "../../staff";

/* The named letter, queued to the operator's own address with a sample
   payload, through a staff-only definer that never takes an address. The
   next drain renders it exactly as it would for a member. */
export async function sendLetterToMe(code: string): Promise<ActionResult> {
  const { supabase, staffId } = await staffContext();
  if (!staffId) return { error: ERR_STAFF };
  const key = (code ?? "").trim();
  if (!/^[a-z0-9-]{2,60}$/.test(key)) return { error: "That is not a letter in the registry." };
  const { error } = await supabase.rpc("send_letter_to_me", { p_code: key });
  if (error) {
    if (/staff only/i.test(error.message)) return { error: ERR_STAFF };
    if (/no address/i.test(error.message)) return { error: "Your profile has no address to send to — set one on You." };
    if (/no such letter/i.test(error.message)) return { error: "That letter is not in the registry." };
    return { error: voice(error) };
  }
  revalidatePath("/bridge/letters");
  return { note: "Queued to your address. The next drain (within five minutes) sends it." };
}
