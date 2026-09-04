import { buildPkpass, pkpassResponse } from "@/lib/wallet/apple";
import { NOT_ON_THE_CHART, voiceJson } from "@/lib/wallet/env";
import { liveWalletToken, readCardFacts } from "@/lib/wallet/facts";
import { authorized, knownPassType, knownSerial, ledgerClosed, serviceContext } from "@/lib/wallet/service";

/* GET passes/{passType}/{serial} — the current pass, for a phone that was
   told it changed.

   Honours If-Modified-Since against the wallet token's touched_at, which is
   the instant the member's standing last moved: same second or earlier is a
   304 with no body, later is a fresh .pkpass with Last-Modified set. The
   Authorization header is the pass's own token and is checked before any
   row is read. */

type Params = { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Params) {
  const ctx = serviceContext();
  if (ctx instanceof Response) return ctx;
  const { passTypeIdentifier, serialNumber } = await params;
  const refused = knownPassType(ctx, passTypeIdentifier) ?? knownSerial(serialNumber) ?? authorized(ctx, request, serialNumber);
  if (refused) return refused;

  const live = await liveWalletToken(ctx.admin, serialNumber);
  if ("notOpen" in live) return ledgerClosed();
  /* A revoked token is a pass the club has taken back; the phone is told the
     pass is gone and Wallet removes it. */
  if ("error" in live) return voiceJson(NOT_ON_THE_CHART, 404);

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) {
    const seen = new Date(ifModifiedSince).getTime();
    const touched = Math.floor(new Date(live.token.touched_at).getTime() / 1000) * 1000;
    if (!Number.isNaN(seen) && touched <= seen) return new Response(null, { status: 304 });
  }

  const facts = await readCardFacts(ctx.admin, serialNumber);
  if (!facts) return voiceJson(NOT_ON_THE_CHART, 404);

  try {
    return pkpassResponse(buildPkpass(ctx.config, facts, live.token.token), live.token.touched_at);
  } catch (err) {
    console.error("[un] the wallet pass did not sign:", err instanceof Error ? err.message : err);
    return voiceJson("The pass did not sign. Shoreside knows.", 500);
  }
}
