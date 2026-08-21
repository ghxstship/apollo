"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PortalResult = { error?: string };

function brandError(raw: string | null | undefined): string {
  const m = (raw ?? "").trim();
  if (!m) return "That didn't land. Try again.";
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
}

export async function redeemReward(rewardId: string): Promise<PortalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase.rpc("redeem_reward", { p_reward: rewardId });
  if (error) return { error: brandError(error.message) };

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const first = (profile?.full_name ?? "member").trim().split(/\s+/)[0] || "member";
  const suffix = first.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "MEMBER";

  for (let attempt = 0; attempt < 6; attempt++) {
    let mid = "";
    for (let i = 0; i < 4; i++) {
      mid += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    const code = `LYR-${mid}-${suffix}`;
    const { error } = await supabase.from("invites").insert({ code, inviter_id: user.id });
    if (!error) {
      revalidatePath("/portal");
      return {};
    }
    /* 23505: the code is taken — roll again. Anything else, surface it. */
    if (error.code !== "23505") return { error: brandError(error.message) };
  }
  return { error: "The mint jammed. Try once more." };
}
