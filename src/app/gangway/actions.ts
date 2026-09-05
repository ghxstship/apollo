"use server";

import { callerAddress } from "@/lib/caller-address";

import { safeNext } from "@/lib/safe-next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PASSWORD_MIN, PROVIDERS, type Provider } from "./ways";

export type GangwayState = {
  sent?: boolean;
  email?: string;
  error?: string;
  /* Which way the panel was on when the state was made, so a refusal lands
     on the form that earned it. */
  way?: "link" | "password" | "reset";
};

async function originOf(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Email and password. The roll is not consulted here: an address that is
   not on it has no account and cannot match, and one wording for both
   failures gives a stranger nothing to learn from the door. Supabase paces
   the attempts. */
export async function signInWithPassword(
  _prev: GangwayState,
  formData: FormData
): Promise<GangwayState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/home"));
  if (email.length > 254 || !EMAIL.test(email) || !password) {
    return { way: "password", email, error: "Enter the email on file and your password." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { way: "password", email, error: "Too many tries. Give it a minute, or send yourself a link instead." };
    return { way: "password", email, error: "That address and password don't match. Forgot it? Send a reset link below." };
  }
  redirect(next);
}

/* A reset link, to the address on file. Answered the same whether or not the
   address is known — the door does not confirm who is on the roll. */
export async function sendResetLink(
  _prev: GangwayState,
  formData: FormData
): Promise<GangwayState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/home"));
  if (email.length > 254 || !EMAIL.test(email)) {
    return { way: "reset", email, error: "Enter the email on file." };
  }
  const origin = await originOf();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(`/gangway/reset?next=${encodeURIComponent(next)}`)}`,
  });
  return { sent: true, way: "reset", email };
}

/* Sign in with a configured provider. The provider must be one the owner has
   switched on (NEXT_PUBLIC_AUTH_PROVIDERS) and Supabase must know its keys;
   the roll trigger still refuses an address that is not on it, and the
   callback says so. */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "") as Provider;
  const next = safeNext(String(formData.get("next") ?? "/home"));
  if (!PROVIDERS.includes(provider)) redirect("/gangway?error=provider");
  const origin = await originOf();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data?.url) redirect("/gangway?error=provider");
  redirect(data.url);
}

/* Set or change the password on a signed-in session — from You, or from the
   reset page a recovery link lands on. */
export type PasswordState = { done?: boolean; error?: string };
export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");
  if (password.length < PASSWORD_MIN) return { error: `A password runs to at least ${PASSWORD_MIN} characters.` };
  if (password.length > 128) return { error: "That is longer than a password needs to be — 128 characters is the ceiling." };
  if (password !== again) return { error: "The two do not match." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/weak|pwned|leaked|compromised/i.test(error.message)) return { error: "That password has turned up in a breach. Pick another." };
    if (/same|different from the old/i.test(error.message)) return { error: "That is the password you already have." };
    return { error: "That didn't land. Try once more." };
  }
  return { done: true };
}

/* Two-step: enrol a code app, prove it once, and the session is second-factor
   from then on. */
export type TwoStepState = {
  factorId?: string;
  qr?: string;
  secret?: string;
  verified?: boolean;
  error?: string;
};
export async function beginTwoStep(): Promise<TwoStepState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  /* An earlier enrolment left half-done is cleared so the code app and the
     club agree on one secret. */
  const { data: listed } = await supabase.auth.mfa.listFactors();
  for (const f of listed?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Code app" });
  if (error || !data) return { error: "Two-step could not start. Try once more." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
export async function confirmTwoStep(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const qr = String(formData.get("qr") ?? "");
  const secret = String(formData.get("secret") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { error: "Start two-step again." };
  if (!/^\d{6}$/.test(code)) return { factorId, qr, secret, error: "Six digits, from the code app." };
  const supabase = await createClient();
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return { factorId, qr, secret, error: "Two-step could not be checked. Try once more." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (error) return { factorId, qr, secret, error: "That code did not match. Codes change every thirty seconds — try the current one." };
  return { verified: true };
}
export async function endTwoStep(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: listed } = await supabase.auth.mfa.listFactors();
  const factors = listed?.all ?? [];
  if (!factors.length) return {};
  for (const f of factors) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) {
      if (/aal2|insufficient/i.test(error.message)) return { error: "Prove the current code first — sign out and back in with your code app, then switch it off here." };
      return { error: "Two-step could not be switched off. Try once more." };
    }
  }
  return {};
}

/* The second step at the door: a code from the app, once per session. */
export type VerifyState = { error?: string };
export async function verifyTwoStep(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNext(String(formData.get("next") ?? "/home"));
  if (!/^\d{6}$/.test(code)) return { error: "Six digits, from the code app." };
  const supabase = await createClient();
  const { data: listed } = await supabase.auth.mfa.listFactors();
  const factor = (listed?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect(next);
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (cErr || !challenge) return { error: "The code could not be checked. Try once more." };
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
  if (error) return { error: "That code did not match. Try the current one." };
  redirect(next);
}



export async function sendMagicLink(
  _prev: GangwayState,
  formData: FormData
): Promise<GangwayState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? "/home"));

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
