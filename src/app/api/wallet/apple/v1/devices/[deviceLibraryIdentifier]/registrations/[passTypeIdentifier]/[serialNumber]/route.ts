import { registerDevice, unregisterDevice } from "@/lib/wallet/registrations";
import { authorized, knownDevice, knownPassType, knownSerial, ledgerClosed, serviceContext } from "@/lib/wallet/service";
import { DID_NOT_LAND, voiceJson } from "@/lib/wallet/env";

/* PassKit web service — one device, one pass.

   POST   register: the phone has added the pass and wants to hear about
          changes. Body is { pushToken }. 201 when new, 200 when already known.
   DELETE unregister: the phone has removed the pass. 200.

   Both carry `Authorization: ApplePass <token>` and both are checked against
   the serial before anything is written. */

type Params = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: Params) {
  const ctx = serviceContext();
  if (ctx instanceof Response) return ctx;
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  const refused =
    knownPassType(ctx, passTypeIdentifier) ?? knownSerial(serialNumber) ?? knownDevice(deviceLibraryIdentifier) ?? authorized(ctx, request, serialNumber);
  if (refused) return refused;

  let pushToken = "";
  try {
    const body = (await request.json()) as { pushToken?: unknown };
    pushToken = typeof body.pushToken === "string" ? body.pushToken.trim() : "";
  } catch {
    /* fall through to the shape check */
  }
  if (!/^[A-Za-z0-9]{16,512}$/.test(pushToken)) return voiceJson("A registration carries a push token.", 400);

  const outcome = await registerDevice(ctx.admin, {
    device_id: deviceLibraryIdentifier,
    pass_type: passTypeIdentifier,
    serial: serialNumber,
    push_token: pushToken,
  });
  if (outcome === "notOpen") return ledgerClosed();
  if (outcome === "error") return voiceJson(DID_NOT_LAND, 500);
  return new Response(null, { status: outcome === "created" ? 201 : 200 });
}

export async function DELETE(request: Request, { params }: Params) {
  const ctx = serviceContext();
  if (ctx instanceof Response) return ctx;
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  const refused =
    knownPassType(ctx, passTypeIdentifier) ?? knownSerial(serialNumber) ?? knownDevice(deviceLibraryIdentifier) ?? authorized(ctx, request, serialNumber);
  if (refused) return refused;

  const outcome = await unregisterDevice(ctx.admin, {
    device_id: deviceLibraryIdentifier,
    pass_type: passTypeIdentifier,
    serial: serialNumber,
  });
  if (outcome === "notOpen") return ledgerClosed();
  if (outcome === "error") return voiceJson(DID_NOT_LAND, 500);
  return new Response(null, { status: 200 });
}
