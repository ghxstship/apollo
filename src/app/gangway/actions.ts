"use server";

import { safeNext } from "@/lib/safe-next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type GangwayState = {
  sent?: boolean;
  email?: string;
  error?: string;
};



export async function sendMagicLink(
  _prev: GangwayState,
  formData: FormData
): Promise<GangwayState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/home"));

  if (!email || !email.includes("@")) {
    return { error: "Enter the email on file." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();

  // Vetted club: only emails on the member roll (accepted application or
  // redeemed invite) or existing members may board. Everyone else applies.
  const { data: mayBoard } = await supabase.rpc("email_may_board", { p_email: email });
  if (!mayBoard) {
    return {
      error: "No pass under that email. Apply for membership, or check the address on file.",
    };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { error: "That didn't land. Give it a moment and send again." };
  }
  return { sent: true, email };
}
