import type { NextRequest } from "next/server";
import { serialsForDevice } from "@/lib/wallet/registrations";
import { knownDevice, knownPassType, ledgerClosed, serviceContext } from "@/lib/wallet/service";
import { DID_NOT_LAND, voiceJson } from "@/lib/wallet/env";

/* GET devices/{device}/registrations/{passType}?passesUpdatedSince=…

   The phone asks which of the passes it holds have changed since it last
   looked. Answer: { lastUpdated, serialNumbers } — 200 with the list, or 204
   when nothing has moved. This call carries no Authorization header by
   Apple's design; the device identifier is the whole of the scope, and the
   answer is a list of serials, which are member ids the device already holds. */

type Params = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = serviceContext();
  if (ctx instanceof Response) return ctx;
  const { deviceLibraryIdentifier, passTypeIdentifier } = await params;
  const refused = knownPassType(ctx, passTypeIdentifier) ?? knownDevice(deviceLibraryIdentifier);
  if (refused) return refused;

  /* Whatever this service handed out as lastUpdated comes back verbatim. It is
     an ISO instant; anything that does not parse is ignored rather than used. */
  const raw = request.nextUrl.searchParams.get("passesUpdatedSince");
  const since = raw && !Number.isNaN(new Date(raw).getTime()) ? new Date(raw).toISOString() : null;

  const result = await serialsForDevice(ctx.admin, deviceLibraryIdentifier, passTypeIdentifier, since);
  if (result === "notOpen") return ledgerClosed();
  if (result === "error") return voiceJson(DID_NOT_LAND, 500);
  if (!result.serials.length) return new Response(null, { status: 204 });

  return Response.json(
    { lastUpdated: result.lastUpdated ?? new Date().toISOString(), serialNumbers: result.serials },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
