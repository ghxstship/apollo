"use server";

import { callerAddress } from "@/lib/caller-address";

import { safeNext } from "@/lib/safe-next";
import { siteOrigin } from "@/lib/site-origin";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createVerifierClient } from "@/lib/supabase/admin";
import { paced } from "@/lib/rate-limit";
import { actionStepUp } from "@/lib/supabase/step-up-action";
import { PASSWORD_MIN, PROVIDERS, type Provider } from "./ways";

export type GangwayState = {
  sent?: boolean;
  email?: string;
  error?: string;
  /* Which way the panel was on when the state was made, so a refusal lands
     on the form that earned it. */
  way?: "link" | "password" | "reset";
};

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
  /* Paced in the database, not in one instance's memory.

     The comment above says "Supabase paces the attempts", which is true and is
     not ours: it is the provider's own throttling, it is not asserted by
     anything in this repository, and it can be changed in a dashboard by
     somebody who does not know this line exists. The audit found no lockout
     and no failed-attempt counter of the club's own anywhere.

     Keyed on the mailbox rather than the address, which is the direction that
     matters here: an attacker working through passwords against one member
     rotates addresses freely, and cannot rotate the mailbox they are trying to
     get into. The address is paced too, on the route handlers; this is the
     half that protects a particular person.

     Twenty in fifteen minutes is generous for somebody who has genuinely
     forgotten which password they used and useless for anything automatic. */
  const admin = createAdminClient();
  if (!(await paced(admin, "sign-in", email, 20, 900))) {
    return { way: "password", email, error: "Too many tries. Give it a minute, or send yourself a link instead." };
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
  /* siteOrigin(), never the request. This link is mailed to the address on
     file and it carries a token_hash that opens the account — an origin
     assembled from the Host header would let a caller who forges Origin and
     Host together (which satisfies the Server Action check, since it only
     compares the two) have the club post that token to a host of their
     choosing. See lib/site-origin.ts. */
  const origin = siteOrigin();
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
  /* The provider sends the member back to this address with a code that
     exchanges for a session, so it is configuration's to choose, not the
     caller's. */
  const origin = siteOrigin();
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
/* Four things happen to an account that the person it belongs to must hear
   about even — especially — when they did not do them. Before 2026-09-06 the
   club had four transports and none fired on an authentication event.

   Best effort, always. The password HAS changed by the time this runs; failing
   the action because a letter would not queue would leave somebody believing
   their password is what it was. The failure is not silent — queue_email is a
   definer write and its error surfaces in app_errors — it simply is not the
   member's problem.

   The address is read from the auth user rather than the profile, because the
   profile's copy can lag and this is the one letter that must reach the
   mailbox that actually opens the account. */
async function sayItHappened(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null },
  template: "password-changed" | "two-step-on" | "two-step-off",
) {
  if (!user.email) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  await supabase.rpc("queue_email", {
    p_to: user.email,
    p_template: template,
    p_payload: {
      name: profile?.full_name ?? null,
      at: new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }),
    },
  });
}

export type PasswordState = { done?: boolean; error?: string; next?: string };
export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");
  /* The one they have now. Absent on the reset page, which is reached by a link
     sent to the address on file — proving the mailbox is the check there, and
     asking for a password somebody has by definition forgotten would make the
     reset useless. Present everywhere else. */
  const current = String(formData.get("current") ?? "");
  if (password.length < PASSWORD_MIN) return { error: `A password runs to at least ${PASSWORD_MIN} characters.` };
  if (password.length > 128) return { error: "That is longer than a password needs to be — 128 characters is the ceiling." };
  if (password !== again) return { error: "The two do not match." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* A server action is neither a page nor a route handler, so neither the
     proxy's path list nor stepUpRefusal() ever covered this. Changing a
     password on a session that never proved the second factor is the whole of
     what two-step was meant to stop. */
  const stepUp = await actionStepUp(supabase, user);
  if (stepUp) return stepUp;

  /* Reauthentication before a credential changes. Without it, a session left
     open on a borrowed laptop is a password change, and the club's own
     security letter would then be the first the member hears of it.

     Verified on a client that holds no session and writes no cookie: calling
     this on the request's own client would mint a fresh session and rewrite
     the cookies in the middle of an action, which is a great deal of moving
     machinery for an answer we discard. It goes through the front door rather
     than the service role so the provider counts the failure and throttles it. */
  if (formData.has("current")) {
    if (!current) return { error: "Type the password you have now first." };
    const { error: wrong } = await createVerifierClient().auth.signInWithPassword({
      email: user.email ?? "",
      password: current,
    });
    if (wrong) return { error: "That is not the password you have now." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/weak|pwned|leaked|compromised/i.test(error.message)) return { error: "That password has turned up in a breach. Pick another." };
    if (/same|different from the old/i.test(error.message)) return { error: "That is the password you already have." };
    return { error: "That didn't land. Try once more." };
  }
  await sayItHappened(supabase, user, "password-changed");
  return { done: true };
}

/* Two-step: enrol a code app, prove it once, and the session is second-factor
   from then on. */
export type TwoStepState = {
  factorId?: string;
  qr?: string;
  secret?: string;
  verified?: boolean;
  /** Shown once, at enrolment. The club cannot show them again. */
  codes?: string[];
  /** Two-step is on but the sheet could not be minted — say so rather than
      leave somebody believing they have a way back in. */
  codesFailed?: boolean;
  error?: string;
};

/* How many, and what one looks like.

   Ten is the number most of the industry settled on: enough that losing a few
   to a bad photocopy does not matter, few enough to fit on something somebody
   will actually keep.

   Crockford's alphabet, in groups of four. No I, L, O or U — the first three
   because they are the digits 1 and 0 in most typefaces and this is a code
   somebody reads off paper under stress, and U because removing it is what
   stops the generator spelling things nobody wants to read out to Shoreside.
   randomInt over the alphabet rather than a modulo of random bytes, which
   would quietly favour the first eight characters. */
const RECOVERY_CODES = 10;
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function recoveryCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Recovery codes, minted the moment two-step is proven and never again
     without asking. Until 2026-09-06 there were none, and the consequence was
     not an inconvenience: a member who lost the phone was locked out for good.
     The reset link and the magic link both land a session at the first
     assurance level, the proxy then sends every protected page to the verify
     screen, and switching two-step off requires the level they cannot reach.
     They were also locked out of /account, where their money and their data
     export live — so an authentication failure became a failure to give
     somebody their own data on request.

     Generated here, hashed here, and only the hashes leave. The plain codes go
     back to the browser once, in this return value, and the club has no way to
     show them again — which is the property that makes them worth having. */
  const codes = Array.from({ length: RECOVERY_CODES }, () => recoveryCode());
  const { error: mintError } = await supabase.rpc("mint_recovery_codes", {
    p_hashes: codes.map((c) => createHash("sha256").update(c).digest("hex")),
  });
  /* Two-step IS on either way — the factor is verified and the club will ask
     for it. Failing the whole enrolment over the codes would leave a member
     with neither, which is worse than a member with two-step and no sheet;
     they are told, and can mint a set from their settings. */
  await sayItHappened(supabase, user, "two-step-on");
  if (mintError) {
    return { verified: true, codesFailed: true };
  }
  return { verified: true, codes };
}

/* A fresh sheet, for a member who has spent theirs or never printed them.
   Replaces the old set entirely — half a sheet is worse than none, because
   somebody holding last year's paper cannot tell which lines still work. */
export async function newRecoveryCodes(): Promise<{ codes?: string[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  /* Minting a new sheet invalidates the old one, which is a credential change
     and belongs behind the second step like the rest of them. */
  const stepUp = await actionStepUp(supabase, user);
  if (stepUp) return { error: stepUp.error };

  const codes = Array.from({ length: RECOVERY_CODES }, () => recoveryCode());
  const { error } = await supabase.rpc("mint_recovery_codes", {
    p_hashes: codes.map((c) => createHash("sha256").update(c).digest("hex")),
  });
  if (error) return { error: "That didn't land. Try once more." };
  return { codes };
}
export async function endTwoStep(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  /* Turning two-step OFF is the one of the four an attacker most wants, and
     the one a member is least likely to notice. It is sent last, after the
     factors are actually gone, so the letter cannot claim something that did
     not happen. */
  if (user) await sayItHappened(supabase, user, "two-step-off");
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
  /* Same reasoning as the reset link: a magic link IS the credential, and the
     host it points at is the club's to decide. */
  const origin = siteOrigin();

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
