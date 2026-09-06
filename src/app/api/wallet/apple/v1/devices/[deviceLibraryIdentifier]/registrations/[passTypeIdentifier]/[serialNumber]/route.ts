import { registerDevice, unregisterDevice } from "@/lib/wallet/registrations";
import { authorized, knownDevice, knownPassType, knownSerial, ledgerClosed, paced, serviceContext } from "@/lib/wallet/service";
import { readBounded } from "@/lib/request-guards";
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
  const slow = paced(request, "register");
  if (slow) return slow;
  const ctx = serviceContext();
  if (ctx instanceof Response) return ctx;
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  const refused =
    knownPassType(ctx, passTypeIdentifier) ?? knownSerial(serialNumber) ?? knownDevice(deviceLibraryIdentifier) ?? authorized(ctx, request, serialNumber);
  if (refused) return refused;

  /* A push token and nothing else. 8 KB is a hundred times what that is. */
  const raw = await readBounded(request, 8 * 1024);
  let pushToken = "";
  try {
    const body = (raw ? JSON.parse(raw) : {}) as { pushToken?: unknown };
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
  /* The pass is real and the token is the holder's; what they have run out of
     is room. Said plainly, because the phone shows the status and an operator
     reads the sentence. */
  if (outcome === "tooManyDevices") {
    return voiceJson("That pass is on as many devices as the club keeps track of.", 429, { "Retry-After": "3600" });
  }
  return new Response(null, { status: outcome === "created" ? 201 : 200 });
}

export async function DELETE(request: Request, { params }: Params) {
  const slow = paced(request, "register");
  if (slow) return slow;
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
