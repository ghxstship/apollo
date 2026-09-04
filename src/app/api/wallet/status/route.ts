import { appleConfig, googleConfig } from "@/lib/wallet/env";

/* GET /api/wallet/status — which wallets this deployment can issue to.

   Two booleans about the deployment, nothing about the member, so no session
   is asked for. The card page's Add-to-wallet control reads this and renders
   nothing at all when both are false — the same fail-closed the issuing routes
   keep with their 501. */

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { apple: Boolean(appleConfig()), google: Boolean(googleConfig()) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
