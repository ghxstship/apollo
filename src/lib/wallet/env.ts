import "server-only";
import { SITE_DOMAIN } from "@/lib/brand";

/* Wallet passes are optional infrastructure, the way card settlement is.

   Nothing here is issued until the owner has enrolled with Apple and Google
   and put the resulting certificates into the environment. Until then every
   wallet route fails closed — a 501 with one sentence — and the card page
   renders no button at all, because /api/wallet/status reads these same
   functions. One place decides what "configured" means so the status the page
   reads and the check the route makes cannot disagree.

   Every value is read at call time, never at module load: a serverless host
   may evaluate this module once and serve many deployments' worth of requests,
   and a test wants to set and unset them between cases. */

export type AppleConfig = {
  certPem: string;
  keyPem: string;
  wwdrPem: string;
  passTypeId: string;
  teamId: string;
  /* Optional — the key half of the pass certificate may be encrypted. */
  keyPassphrase: string | undefined;
};

export type GoogleConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  serviceAccountKeyPem: string;
};

export type ApnsConfig = {
  keyPem: string;
  keyId: string;
  teamId: string;
};

function read(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  /* A PEM pasted into a one-line environment field arrives with literal
     backslash-n where the line breaks were. Both forms are accepted. */
  return v.includes("\\n") && !v.includes("\n") ? v.replace(/\\n/g, "\n") : v;
}

export function appleConfig(): AppleConfig | null {
  const certPem = read("APPLE_PASS_CERT_PEM");
  const keyPem = read("APPLE_PASS_KEY_PEM");
  const wwdrPem = read("APPLE_WWDR_PEM");
  const passTypeId = read("APPLE_PASS_TYPE_ID");
  const teamId = read("APPLE_TEAM_ID");
  if (!certPem || !keyPem || !wwdrPem || !passTypeId || !teamId) return null;
  return { certPem, keyPem, wwdrPem, passTypeId, teamId, keyPassphrase: read("APPLE_PASS_KEY_PASSPHRASE") };
}

export function googleConfig(): GoogleConfig | null {
  const issuerId = read("GOOGLE_WALLET_ISSUER_ID");
  const serviceAccountEmail = read("GOOGLE_WALLET_SA_EMAIL");
  const serviceAccountKeyPem = read("GOOGLE_WALLET_SA_KEY_PEM");
  if (!issuerId || !serviceAccountEmail || !serviceAccountKeyPem) return null;
  return { issuerId, serviceAccountEmail, serviceAccountKeyPem };
}

export function apnsConfig(): ApnsConfig | null {
  const keyPem = read("APPLE_APNS_KEY_PEM");
  const keyId = read("APPLE_APNS_KEY_ID");
  const teamId = read("APPLE_APNS_TEAM_ID") ?? read("APPLE_TEAM_ID");
  if (!keyPem || !keyId || !teamId) return null;
  return { keyPem, keyId, teamId };
}

/* The PassKit web service reads and writes on behalf of a device, not a
   member — there is no session cookie on those calls — so it needs the
   service-role client, exactly as the Stripe webhook does. */
export function walletServiceEnabled(): boolean {
  return Boolean(appleConfig() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/* The public origin a pass points back at: the barcode URL, the web service
   URL, the Google save-link origin. Read from NEXT_PUBLIC_SITE_URL so a
   preview deploy issues passes that point at itself, falling back to the
   production domain — which is right in production and the only honest
   default anywhere else. */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || `https://${SITE_DOMAIN}`;
  return raw.replace(/\/+$/, "");
}

/* What a pass's barcode carries. Not the sixty-second credential — a pass
   cannot rotate — but a durable wallet token behind a URL, so a phone that
   scans it lands somewhere sensible and the gangway can pull the token off the
   path and ask verify_wallet_token(). */
export function walletUrl(token: string): string {
  return `${siteOrigin()}/w/${token}`;
}

/* ── The voice ────────────────────────────────────────────────────────────
   One sentence each. No exclamation marks, no processor-side nouns. */
export const NOT_ISSUED_HERE = "Wallet passes are not issued on this deployment yet.";
export const SIGN_IN_FIRST = "Sign in first.";
export const LEDGER_NOT_OPEN = "The club's records don't hold wallet passes yet. Shoreside can sort it.";
export const NO_CARD_YET = "Your member card is not issued yet. Shoreside can sort it.";
export const DID_NOT_LAND = "That didn't land. Try again.";
export const NOT_ON_THE_CHART = "Nothing at this address.";
export const NOT_YOUR_PASS = "That pass is not yours to ask about.";

export function voiceJson(message: string, status: number, headers?: Record<string, string>): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store", ...headers } }
  );
}
