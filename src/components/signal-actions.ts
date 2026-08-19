"use server";

/* Signal layer — the server half of push-controls.tsx and phone-field.tsx.
   Client components can't declare server actions, so both live here.
   Members own their own push_subscriptions rows under RLS; the outbox and the
   edge functions are already wired, so nothing here touches a queue. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SignalResult = { ok?: true; error?: string };

/* — Web push — */

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<SignalResult> {
  const endpoint = sub.endpoint?.trim() ?? "";
  const p256dh = sub.p256dh?.trim() ?? "";
  const auth = sub.auth?.trim() ?? "";
  if (!endpoint || !p256dh || !auth) return { error: "That device sent an incomplete address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* One row per endpoint — re-enabling on the same device re-aims it. */
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ profile_id: user.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });

  if (error) return { error: "That didn't land. Try again." };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<SignalResult> {
  const target = endpoint?.trim() ?? "";
  if (!target) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("profile_id", user.id)
    .eq("endpoint", target);

  if (error) return { error: "That didn't land. Try again." };
  return { ok: true };
}

/* — Phone capture for weather holds —
   Light E.164 normalisation: keep a leading +, drop everything else that
   isn't a digit, and assume North America for a bare ten-digit number. */

/* Not exported: a "use server" module may only export async functions. */
function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (plus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export type PhoneState = { saved?: boolean; cleared?: boolean; error?: string; value?: string };

export async function savePhone(_prev: PhoneState, formData: FormData): Promise<PhoneState> {
  const raw = String(formData.get("phone") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first.", value: raw };

  if (!raw.trim()) {
    const { error } = await supabase
      .from("profiles")
      .update({ phone: null, phone_verified: false })
      .eq("id", user.id);
    if (error) return { error: "That didn't land. Try again.", value: raw };
    revalidatePath("/you");
    return { cleared: true, value: "" };
  }

  const phone = normalisePhone(raw);
  if (!phone) return { error: "A number the weather can reach — with country code.", value: raw };

  const { error } = await supabase
    .from("profiles")
    .update({ phone, phone_verified: false })
    .eq("id", user.id);
  if (error) return { error: "That didn't land. Try again.", value: raw };

  revalidatePath("/you");
  return { saved: true, value: phone };
}
