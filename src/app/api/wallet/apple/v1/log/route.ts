import { appleConfig, NOT_ISSUED_HERE, voiceJson } from "@/lib/wallet/env";

/* POST log — a phone reporting what went wrong with a pass.

   Body is { logs: [string] }. The lines go to the server log under a prefix an
   operator can search for, and the answer is always 200: this is the device
   telling us about a fault, and a fault in receiving that report is not the
   device's problem. Bounded, because it is unauthenticated by Apple's design. */

export const dynamic = "force-dynamic";

const MAX_LINES = 50;
const MAX_LINE = 2000;

export async function POST(request: Request) {
  if (!appleConfig()) return voiceJson(NOT_ISSUED_HERE, 501);
  try {
    const body = (await request.json()) as { logs?: unknown };
    const logs = Array.isArray(body.logs) ? body.logs : [];
    for (const line of logs.slice(0, MAX_LINES)) {
      if (typeof line === "string") console.warn("[un] wallet device log:", line.slice(0, MAX_LINE));
    }
  } catch {
    /* Not JSON. Still a 200 — see above. */
  }
  return new Response(null, { status: 200 });
}
