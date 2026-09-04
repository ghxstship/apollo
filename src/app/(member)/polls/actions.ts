"use server";

import { revalidatePath } from "next/cache";
import { voiceWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type VoteResult = { error?: string };

/* One vote a member, changeable until the question closes. cast_vote carries
   every rule — signed in, active, the question exists and is open, the option
   is one of its own — and raises each refusal in the club's words, which
   voiceWith passes through. Nothing here decides anything the RPC does not. */
export async function castVote(pollId: string, option: number): Promise<VoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  if (!/^[0-9a-f-]{36}$/i.test(pollId)) {
    return { error: "This page has lost the question. Reload it, then vote again." };
  }
  if (!Number.isInteger(option) || option < 0 || option > 5) {
    return { error: "Pick one of the options." };
  }

  const { error } = await supabase.rpc("cast_vote", { p_poll: pollId, p_option: option });
  if (error) return { error: await voiceWith(supabase, error) };

  revalidatePath("/polls");
  return {};
}
