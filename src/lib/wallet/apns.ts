import "server-only";
import { createSign } from "node:crypto";
import { connect } from "node:http2";
import { createAdminClient } from "@/lib/supabase/admin";
import { moduleTables } from "@/lib/module-tables";
import { apnsConfig, appleConfig, googleConfig, type ApnsConfig } from "./env";
import { issueWalletTokenFor, readCardFacts } from "./facts-admin";
import { updateGenericObject } from "./google";
import { dropPushToken, pushTokensForSerial } from "./registrations";

/* Telling a phone its pass has changed.

   Apple's contract is deliberately empty: the push carries no content, only
   the pass type as its topic, and the device answers by calling the web
   service for the pass afresh. So the update path is (1) bump the pass's
   touched_at so `passesUpdatedSince` and If-Modified-Since see a change,
   (2) push every registered device, (3) let them fetch. Google's contract is
   the opposite — the object is PATCHed in place and the phone is told by
   Google — so the same call does both.

   APNs wants HTTP/2 and a token: an ES256 JWT under the .p8 key from the
   developer account, keyed by its key id and the team id. A pass push always
   goes to the production host; there is no sandbox for Wallet. Every part of
   this is gated on its own environment, and a deployment without the key
   simply skips the push — the pass still updates the next time the device
   asks on its own schedule. */

const APNS_HOST = "https://api.push.apple.com";
const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedJwt: { value: string; issuedAt: number; keyId: string } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/* ES256 in the JOSE encoding — raw r||s, not the DER Node emits by default. */
export function apnsJwt(config: ApnsConfig, now = Date.now()): string {
  if (cachedJwt && cachedJwt.keyId === config.keyId && now - cachedJwt.issuedAt < TOKEN_TTL_MS) return cachedJwt.value;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const sig = signer.sign({ key: config.keyPem, dsaEncoding: "ieee-p1363" }, "base64url");
  const value = `${header}.${claims}.${sig}`;
  cachedJwt = { value, issuedAt: now, keyId: config.keyId };
  return value;
}

export type PushOutcome = "sent" | "gone" | "failed";

/* One empty push to one device token. 410 means the device has dropped the
   pass — the caller removes the registration. */
export function pushPassUpdate(config: ApnsConfig, passType: string, deviceToken: string): Promise<PushOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: PushOutcome) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let client: ReturnType<typeof connect>;
    try {
      client = connect(APNS_HOST);
    } catch {
      done("failed");
      return;
    }
    const timer = setTimeout(() => {
      client.close();
      done("failed");
    }, 10_000);
    client.on("error", () => {
      clearTimeout(timer);
      done("failed");
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsJwt(config)}`,
      "apns-topic": passType,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    req.on("response", (headers) => {
      const status = Number(headers[":status"]);
      clearTimeout(timer);
      req.resume();
      req.on("end", () => client.close());
      done(status === 200 ? "sent" : status === 410 ? "gone" : "failed");
    });
    req.on("error", () => {
      clearTimeout(timer);
      client.close();
      done("failed");
    });
    req.end("{}");
  });
}

export type NotifyResult = {
  /* What happened, in one word each, so a caller can log it and move on. */
  touched: boolean;
  apple: { pushed: number; dropped: number; skipped?: "no-apns" | "no-apple" | "no-service-role" | "ledger-not-open" };
  google: { updated: boolean; skipped?: "no-google" | "no-service-role" | "ledger-not-open" };
};

/* Call this when a member's standing changes — a plan change, a hold placed
   or lifted, a name or number reissued. It never throws: a wallet is a
   convenience, and the change that triggered it has already landed. */
export async function notifyWalletUpdate(profileId: string): Promise<NotifyResult> {
  const result: NotifyResult = { touched: false, apple: { pushed: 0, dropped: 0 }, google: { updated: false } };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    result.apple.skipped = "no-service-role";
    result.google.skipped = "no-service-role";
    return result;
  }
  const admin = createAdminClient();

  /* (1) The pass has changed: say so on the row the web service reads. */
  const { error: touchError } = await moduleTables(admin)
    .from("wallet_tokens")
    .update({ touched_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .is("revoked_at", null);
  if (touchError) {
    result.apple.skipped = "ledger-not-open";
    result.google.skipped = "ledger-not-open";
    return result;
  }
  result.touched = true;

  /* (2) Apple: push every device that registered for this serial. */
  const apple = appleConfig();
  const apns = apnsConfig();
  if (!apple) result.apple.skipped = "no-apple";
  else if (!apns) result.apple.skipped = "no-apns";
  else {
    const tokens = await pushTokensForSerial(admin, apple.passTypeId, profileId);
    for (const t of tokens) {
      const outcome = await pushPassUpdate(apns, apple.passTypeId, t);
      if (outcome === "sent") result.apple.pushed += 1;
      if (outcome === "gone") {
        await dropPushToken(admin, t);
        result.apple.dropped += 1;
      }
    }
  }

  /* (3) Google: rewrite the object in place. */
  const google = googleConfig();
  if (!google) result.google.skipped = "no-google";
  else {
    const facts = await readCardFacts(admin, profileId);
    const token = facts ? await issueWalletTokenFor(admin, profileId) : null;
    if (facts && token) result.google.updated = await updateGenericObject(google, facts, token.token);
  }

  return result;
}
