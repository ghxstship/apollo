import { createClient } from "@/lib/supabase/server";
import { voice } from "@/lib/errors";
import { googleConfig, LEDGER_NOT_OPEN, NO_CARD_YET, NOT_ISSUED_HERE, SIGN_IN_FIRST, voiceJson } from "@/lib/wallet/env";
import { issueWalletToken, readCardFacts } from "@/lib/wallet/facts";
import { ensureGenericClass, saveLink } from "@/lib/wallet/google";

/* GET /api/wallet/google — a redirect to the member's Save to Google Wallet
   link. The link is a signed JWT carrying the pass object; Google renders the
   save sheet from it. The class the object belongs to is created on first use
   through the Wallet REST API and remembered for the life of the process. */

export const dynamic = "force-dynamic";

export async function GET() {
  const config = googleConfig();
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

  /* Best-effort: an unreachable API is logged and the save is still offered —
     the class may well exist from an earlier run or the one-time setup step. */
  const cls = await ensureGenericClass(config);
  if (cls === "unreachable") console.warn("[un] the Google Wallet class could not be confirmed; offering the save link regardless");

  try {
    const link = saveLink(config, facts, issued.token.token);
    return new Response(null, {
      status: 302,
      headers: { Location: link, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (err) {
    console.error("[un] the Google Wallet link did not sign:", err instanceof Error ? err.message : err);
    return voiceJson("The pass did not sign. Shoreside knows.", 500);
  }
}
