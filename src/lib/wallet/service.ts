import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { clientKey, overLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { authTokenMatches, bearerFromHeader } from "./apple";
import { appleConfig, NOT_ISSUED_HERE, NOT_ON_THE_CHART, NOT_YOUR_PASS, voiceJson, type AppleConfig } from "./env";

/* The PassKit web service's shared preamble.

   Every /api/wallet/apple/v1/* handler is called by a phone, not a member: no
   cookie, no session, an `Authorization: ApplePass <token>` header where the
   pass's own authentication token is the credential. The handlers therefore
   run with the service-role client, and refuse — in order — when passes are
   not issued here at all, when the service role is missing, when the pass type
   in the path is not ours, and when the token does not match the serial.

   Apple's expected status codes are kept exactly: 401 for a bad token, 404 for
   an unknown pass, 200/201/204/304 as the spec names them. The bodies on the
   refusals are in the club's voice because an operator reads them in a log;
   the phone reads only the status. */

export type ServiceContext = { config: AppleConfig; admin: SupabaseClient<Database> };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serviceContext(): ServiceContext | Response {
  const config = appleConfig();
  if (!config) return voiceJson(NOT_ISSUED_HERE, 501);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return voiceJson("The wallet service has no key to the records on this deployment.", 503);
  }
  return { config, admin: createAdminClient() };
}

/* The path's pass type must be the one this deployment signs for. Anything
   else is not on the chart — never a hint that the identifier was close. */
export function knownPassType(ctx: ServiceContext, passType: string): Response | null {
  return passType === ctx.config.passTypeId ? null : voiceJson(NOT_ON_THE_CHART, 404);
}

export function knownSerial(serial: string): Response | null {
  return UUID.test(serial) ? null : voiceJson(NOT_ON_THE_CHART, 404);
}

export function authorized(ctx: ServiceContext, request: Request, serial: string): Response | null {
  const token = bearerFromHeader(request.headers.get("authorization"));
  return authTokenMatches(ctx.config, serial, token) ? null : voiceJson(NOT_YOUR_PASS, 401);
}

/* A device library identifier is opaque; it is bounded so it cannot be used
   to write a novel into a key column. */
export function knownDevice(deviceId: string): Response | null {
  return /^[A-Za-z0-9._:-]{1,200}$/.test(deviceId) ? null : voiceJson(NOT_ON_THE_CHART, 404);
}

/* The pace a phone keeps.

   Every call on this service is unauthenticated at the point it arrives — the
   ApplePass token is checked, but checking it is work, and reading a pass is
   more work than that. A device asks for a pass when it is pushed one and
   registers once per pass it holds; two calls a second from one address is far
   above that and still bounds a caller who is not a phone. Deliberately not
   tighter: several phones behind one carrier address are one address here, and
   a member whose pass will not load is a worse failure than a stranger who
   costs us a query.

   Keyed on the address rather than on the serial or the device, because both
   of those are things the caller supplies — a bucket a caller can vary is not
   a bucket. */
const PACE = 120;
const PACE_WINDOW_MS = 60_000;

export function paced(request: Request, bucket: string): Response | null {
  if (!overLimit(`wallet-${bucket}:${clientKey(request)}`, PACE, PACE_WINDOW_MS)) return null;
  return voiceJson("That is more than the club answers at once. Try again shortly.", 429, { "Retry-After": "60" });
}

/* Apple's own record of the wallet service is 503 for "come back later", and
   the ledger not being open yet is exactly that. */
export function ledgerClosed(): Response {
  return voiceJson("The club's records don't hold wallet passes yet.", 503, { "Retry-After": "3600" });
}
