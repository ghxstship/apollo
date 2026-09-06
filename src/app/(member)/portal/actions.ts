"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type PortalResult = { error?: string };

export async function redeemReward(rewardId: string): Promise<PortalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("redeem_reward", { p_reward: rewardId });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/portal");
  revalidatePath("/home");
  return {};
}

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export async function mintInvite(): Promise<PortalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* The code used to carry the inviter's first name and four Math.random
     characters. validate_invite is anon-callable, so that made a member's name
     brute-forceable from a code that already named them. Nothing about the
     inviter goes into the code now, and the randomness is crypto-strength.

     The ROLL stays here; the RULES moved to mint_invite (2026-09-06). One live
     code at a time, ninety days on the clock, and a per-season count that
     deepens with the league are none of them things a WITH CHECK can ask — it
     sees one row and never a count. This action no longer writes to the table:
     it hands the code to the definer, which retires a code that ran out its
     days before it writes the replacement, and refuses in sentences. */
  for (let attempt = 0; attempt < 6; attempt++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const body = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    const code = `UN-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    const { error } = await supabase.rpc("mint_invite", { p_code: code });
    if (!error) {
      revalidatePath("/portal");
      revalidatePath("/you");
      return {};
    }
    /* 23505: the code is taken — roll again. Every other refusal is a rule
       the member should read, not a collision to retry through. */
    if (error.code !== "23505") return { error: await voiceWith(supabase, error) };
  }
  return { error: "The mint jammed. Try once more." };
}
