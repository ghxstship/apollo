import { createClient } from "@/lib/supabase/server";
import { voice } from "@/lib/errors";
import { buildPkpass, pkpassResponse } from "@/lib/wallet/apple";
import { appleConfig, LEDGER_NOT_OPEN, NO_CARD_YET, NOT_ISSUED_HERE, SIGN_IN_FIRST, voiceJson } from "@/lib/wallet/env";
import { issueWalletToken, readCardFacts } from "@/lib/wallet/facts";

/* GET /api/wallet/apple — the signed-in member's card as a .pkpass.

   Reads run on the member's own client, so RLS scopes every row to them; the
   wallet token comes from issue_wallet_token(), a definer RPC keyed on
   auth.uid(). Without the certificates this answers 501 and one sentence, and
   the card page — which reads /api/wallet/status — never offers the button. */

export const dynamic = "force-dynamic";

export async function GET() {
  const config = appleConfig();
  if (!config) return voiceJson(NOT_ISSUED_HERE, 501);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return voiceJson(SIGN_IN_FIRST, 401);

  const facts = await readCardFacts(supabase, user.id);
  if (!facts) return voiceJson(NO_CARD_YET, 404);

  const issued = await issueWalletToken(supabase);
  if ("notOpen" in issued) return voiceJson(LEDGER_NOT_OPEN, 503);
  if ("error" in issued) return voiceJson(voice(issued.error), 502);

  try {
    const bytes = buildPkpass(config, facts, issued.token.token);
    return pkpassResponse(bytes, issued.token.touched_at);
  } catch (err) {
    /* A certificate that does not parse or a key that does not match it. The
       member gets one sentence; the operator gets the cause in the log. */
    console.error("[un] the wallet pass did not sign:", err instanceof Error ? err.message : err);
    return voiceJson("The pass did not sign. Shoreside knows.", 500);
  }
}
