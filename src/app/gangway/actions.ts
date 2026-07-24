"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type GangwayState = {
  sent?: boolean;
  email?: string;
  error?: string;
};

/* Only ever bounce back to a path we own. */
function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/harbor";
}

export async function sendMagicLink(
  _prev: GangwayState,
  formData: FormData
): Promise<GangwayState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/harbor"));

  if (!email || !email.includes("@")) {
    return { error: "Enter the email on file." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
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
