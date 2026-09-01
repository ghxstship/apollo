"use server";

import { callerAddress } from "@/lib/caller-address";

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
  /* The visitor's own address is forwarded, because this runs in a SERVER
     ACTION: without it PostgREST sees this web server for every caller and the
     per-caller bucket becomes one shared budget for the whole site — the exact
     trap that made the status-page limit a self-inflicted outage. */
  const { data: mayBoard, error: gateError } = await supabase.rpc("email_may_board", {
    p_email: email,
    p_fingerprint: callerAddress(h),
  });
  if (gateError) {
    /* 53400 is the pacing speaking, and it says something useful. Anything else
       is ours and should not be dressed up as the member's problem. */
    return {
      error:
        gateError.code === "53400"
          ? gateError.message
          : "That didn't land. Give it a moment and send again.",
    };
  }
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
